BS.GitHubWebHooks = {
    info: {},
    forcePopup: {},
    addWebHook: function (element, type, id, popup) {
        if (document.location.href.indexOf(BS.ServerInfo.url) == -1) {
            if (confirm("Request cannot be processed because browser URL does not correspond to URL specified in TeamCity server configuration: " + BS.ServerInfo.url + ".\n\n" +
                    "Click Ok to redirect to correct URL or click Cancel to leave URL as is.")) {
                var contextPath = BS.RequestInfo.context_path;
                var pathWithoutContext = document.location.pathname;
                if (contextPath.length > 0) {
                    pathWithoutContext = pathWithoutContext.substring(contextPath.length);
                }
                document.location.href = BS.ServerInfo.url + pathWithoutContext + document.location.search + document.location.hash;
            }
            return;
        }
        BS.Log.info("From arguments: " + id + ' ' + type);

        //var progress = $$("# .progress").show();

        var info = BS.GitHubWebHooks.info[type + '_' + id];
        if (info) {
            var repo = info['owner'] + '/' + info['name'];
            if (BS.GitHubWebHooks.forcePopup[repo]) {
                popup = true
            }
        }

        if (popup) {
            BS.Util.popupWindow(window.base_uri + '/oauth/github/add-webhook.html?action=add-popup&id=' + id + '&type=' + type, 'add_webhook_' + type + '_' + id);
            return
        }

        var that = element;

        BS.ProgressPopup.showProgress(element, "Adding WebHook", {shift: {x: -65, y: 20}, zIndex: 100});
        BS.ajaxRequest(window.base_uri + "/oauth/github/add-webhook.html", {
            method: "post",
            parameters: {
                "action": "add",
                "type": type,
                "id": id
            },
            onComplete: function (transport) {
                //progress.hide();
                BS.ProgressPopup.hidePopup(0, true);

                var json = transport.responseJSON;
                if (json['redirect']) {
                    BS.Log.info("Redirect response received");
                    var link = "<a href='#' onclick=\"BS.GitHubWebHooks.addWebHook(this, '" + type + "', '" + id + "', true); return false\">Refresh access token</a>";

                    BS.Util.Messages.show('redirect', 'GitHub authorization needed. ' + link);
                    //BS.Util.popupWindow(json['redirect'], 'add_webhook_' + type + '_' + id);
                    $j(that).append(link);
                    $(that).onclick = function () {
                        BS.GitHubWebHooks.addWebHook(that, '${Type}', '${Id}', true);
                        return false
                    };
                    $(that).innerHTML = "Refresh token and add WebHook"
                } else if (json['error']) {
                    BS.Log.error("Sad :( Something went wrong: " + json['error']);
                    alert(json['error']);
                } else if (json['result']) {
                    var res = json['result'];
                    //if ("TokenScopeMismatch" == res) {
                    //    BS.GitHubWebHooks.showMessage("Token you provided have no access to repository");
                    //    // TODO: Add link to refresh/request token (via popup window)
                    //    that.onclick = function (x) {
                    //        BS.GitHubWebHooks.addWebHook(x, '${Type}', '${Id}', true);
                    //        return false
                    //    };
                    //    //("<a href='#' onclick='BS.GitHubWebHooks.addWebHook(this, '${Type}', '${Id}', false); return false'>Refresh access token</a>");
                    //    that.innerHTML = "Refresh token and add WebHook"
                    //} else {
                    BS.GitHubWebHooks.processResult(json, res);
                    //}
                } else {
                    BS.Log.error("Unexpected response: " + json.toString())
                }
                BS.GitHubWebHooks.refreshReports();
            }
        });
    },

    addConnection: function (element, projectId, serverUrl) {
        document.location.href = window.base_uri + "/admin/editProject.html?projectId=" + projectId + "&tab=oauthConnections#"
    },

    processResult: function (json, res) {
        var info = json['info'];
        var message = json['message'];
        var repo = info['owner'] + '/' + info['name'];
        var warning = false;
        if ("AlreadyExists" == res) {
        } else if ("Created" == res) {
        } else if ("TokenScopeMismatch" == res) {
            message = "Token you provided have no access to repository, try again";
            warning = true;
            // TODO: Add link to refresh/request token (via popup window)
            BS.GitHubWebHooks.forcePopup[repo] = true
        } else if ("NoAccess" == res) {
            warning = true;
        } else if ("UserHaveNoAccess" == res) {
            warning = true;
        } else {
            BS.Log.warn("Unexpected result: " + res);
            alert("Unexpected result: " + res);
        }
        BS.Util.Messages.show(res, message, warning ? {verbosity: 'warn'} : {});
    },

    callback: function (json) {
        if (json['error']) {
            BS.Log.error("Sad :( Something went wrong: " + json['error']);
            alert(json['error']);
        } else if (json['result']) {
            var res = json['result'];
            BS.GitHubWebHooks.processResult(json, res);
        } else {
            BS.Log.error("Unexpected response: " + json.toString())
        }
        BS.GitHubWebHooks.refreshReports();
    },

    refreshReports: function () {
        var summary = $('reportSummary');
        var categories = $('reportCategories');
        if (summary) {
            summary.refresh();
            categories.refresh();
            return
        }
        var popup = $j('.healthItemIndicator[data-popup]');
        if (popup) {
            BS.Hider.hideDiv(popup.attr('data-popup'));
        }
        //window.location.reload(false)
    },
};

BS.Util.Messages = {
    show: function (group, text) {
        var options = arguments[2] || {};
        options = $j.extend({}, options, {
            verbosity: 'info', // Either 'info' or 'warn'
            class: 'messages_group_' + group,
            id: 'message_id_' + group
        });

        BS.Log.info("Message: " + text);

        // Hide previous messages from the same group, id
        BS.Util.Messages.hide({class: options.class});
        BS.Util.Messages.hide({id: options.id});

        // TODO: Use node manipulations instead of html code generation (?) Note: message may contain html tags
        var content = '<div class="' + options.class + ' successMessage' + (options.verbosity == 'warn' ? ' attentionComment' : '') + '" id="' + options.id + '" style="display: none;">' + text + '</div>';
        var place = $('filterForm');
        if (place) {
            place.insert({'after': content});
        } else {
            place = $('content');
            place.insert({'top': content});
        }
        $(options.id).show();
        if (!window._shownMessages) window._shownMessages = {};
        window._shownMessages[options.id] = options.verbosity;

        // Why?
        BS.MultilineProperties.updateVisible();
    },

    hide: function (options) {
        if (options.id) {
            if ($(options.id)) {
                if (window._shownMessages && window._shownMessages[id]) {
                    delete window._shownMessages[id];
                }
                $(options.id).remove()
            }
        }
        if (options.class) {
            $j('.' + options.class).remove();
        }
        if (options.group) {
            $j('.' + 'messages_group_' + options.group).remove();
        }
    }
};


window.GitHubWebHookCallback = BS.GitHubWebHooks.callback;