package org.jetbrains.teamcity.github

import com.intellij.openapi.diagnostic.Logger
import jetbrains.buildServer.serverSide.ProjectManager
import jetbrains.buildServer.serverSide.executors.ExecutorServices
import jetbrains.buildServer.serverSide.oauth.OAuthConnectionDescriptor
import jetbrains.buildServer.serverSide.oauth.OAuthConnectionsManager
import jetbrains.buildServer.serverSide.oauth.OAuthTokensStorage
import jetbrains.buildServer.serverSide.oauth.github.GitHubClientFactory
import jetbrains.buildServer.serverSide.oauth.github.GitHubConstants
import jetbrains.buildServer.users.UserModelEx
import org.jetbrains.teamcity.github.action.GetAllWebHooksAction
import org.jetbrains.teamcity.github.controllers.GitHubWebHookListener
import java.util.*
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

class WebhookPeriodicalChecker(
        private val myProjectManager: ProjectManager,
        private val myOAuthConnectionsManager: OAuthConnectionsManager,
        private val myAuthDataStorage: AuthDataStorage,
        private val myWebHooksStorage: WebHooksStorage,
        private val myUserModel: UserModelEx,
        private val myWebHooksManager: WebHooksManager,
        private val myExecutorServices: ExecutorServices,
        private val myOAuthTokensStorage: OAuthTokensStorage,
        private val myTokensHelper: TokensHelper
) {

    private var myTask: ScheduledFuture<*>? = null

    companion object {
        private val LOG = Logger.getInstance(WebhookPeriodicalChecker::class.java.name)
    }

    fun init() {
        myTask = myExecutorServices.normalExecutorService.scheduleWithFixedDelay({ doCheck() }, 1, 60, TimeUnit.MINUTES)
    }

    fun destroy() {
        myTask?.cancel(false)
    }

    private fun doCheck() {
        val ignoredServers = ArrayList<String>()

        val toCheck = ArrayDeque(myWebHooksStorage.getAll())

        while (toCheck.isNotEmpty()) {
            val pair = toCheck.pop()
            val (info, hook) = pair
            val callbackUrl = hook.callbackUrl
            val pubKey = GitHubWebHookListener.getPubKeyFromRequestPath(callbackUrl)
            if (pubKey == null) {
                LOG.warn("Callback url (${hook.callbackUrl}) of hook '${hook.url}' does not contains security check public key")
                forget(info, pubKey)
                continue
            }
            val authData = myAuthDataStorage.find(pubKey)
            if (authData == null) {
                LOG.warn("Cannot find auth data for hook '${hook.url}'")
                forget(info, pubKey)
                continue
            }

            val connection = getConnection(authData)
            if (connection == null) {
                LOG.warn("OAuth Connection for repository '$info' not found")
                forget(info, pubKey)
                continue
            }

            val user = myUserModel.findUserById(authData.userId)
            if (user == null) {
                LOG.warn("User '${authData.userId}' which created hook for repository '$info', no longer exists")
                forget(info, pubKey)
                continue
            }

            val tokens = myTokensHelper.getExistingTokens(listOf(connection), user).entries.firstOrNull()?.value.orEmpty()
            if (tokens.isEmpty()) {
                LOG.warn("No OAuth tokens to access repository '$info'")
                forget(info, pubKey)
                continue
            }

            if (ignoredServers.contains(info.server)) {
                // Server ignored for some time due to error on github
                continue
            }

            val ghc = GitHubClientFactory.createGitHubClient(connection.parameters[GitHubConstants.GITHUB_URL_PARAM]!!)

            var success = false
            var retry = false
            tokens@for (token in tokens) {
                ghc.setOAuth2Token(token.accessToken)
                try {
                    GetAllWebHooksAction.doRun(info, ghc, myWebHooksManager)
                    // TODO: Check&remember latest delivery status. If something wrong - report health item
                    success = true
                    break@tokens
                } catch(e: GitHubAccessException) {
                    when (e.type) {
                        GitHubAccessException.Type.InvalidCredentials -> {
                            LOG.warn("Removing incorrect (outdated) token (user:${token.oauthLogin}, scope:${token.scope})")
                            myOAuthTokensStorage.removeToken(connection.id, token.accessToken)
                            retry = true
                        }
                        GitHubAccessException.Type.TokenScopeMismatch -> {
                            LOG.warn("Token (user:${token.oauthLogin}, scope:${token.scope}) scope is not enough to check hook status")
                            myTokensHelper.markTokenIncorrect(token)
                            retry = true
                        }
                        GitHubAccessException.Type.UserHaveNoAccess -> {
                            LOG.warn("User (TC:${user.describe(false)}, GH:${token.oauthLogin}) have no access to repository $info, cannot check hook status")
                            if (tokens.map { it.oauthLogin }.distinct().size == 1) {
                                forget(info, pubKey)
                            } else {
                                // TODO: ??? Seems TC user has many tokens with different GH users
                            }
                            retry = false
                        }
                        GitHubAccessException.Type.NoAccess -> {
                            LOG.warn("No access to repository $info for unknown reason, cannot check hook status")
                            retry = false
                        }
                        GitHubAccessException.Type.InternalServerError -> {
                            LOG.info("Cannot check hooks status for repository $info: Error on GitHub side. Will try later")
                            ignoredServers.add(info.server);
                            break@tokens
                        }
                    }
                }
            }

            if (!success && retry) {
                toCheck.add(pair)
            }

            if (ghc.remainingRequests in 0..10) {
                ignoredServers.add(info.server)
            }
        }
    }

    private fun getConnection(authData: AuthDataStorage.AuthData): OAuthConnectionDescriptor? {
        val info = authData.connection ?: return null
        val project = myProjectManager.findProjectByExternalId(info.projectExternalId)
        if (project == null) {
            LOG.warn("OAuth Connection project '${info.projectExternalId}' not found")
            return null
        }
        val connection = myOAuthConnectionsManager.findConnectionById(project, info.id)
        if (connection == null) {
            LOG.warn("OAuth Connection with id '${info.id}' not found in project ${project.describe(true)} and it parents")
            return null
        }
        return connection
    }

    private fun forget(info: GitHubRepositoryInfo, pubKey: String?) {
        myWebHooksStorage.delete(info)
        pubKey?.let { myAuthDataStorage.delete(it) }
    }

}