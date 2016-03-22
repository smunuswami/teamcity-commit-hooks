BS.GitHubWebHooks = {};
(function (WH) {
    WH.info = {};
    WH.forcePopup = {};
    WH.actions = {
        add: {
            id: "add",
            name: "Add",
            progress: "Adding WebHook",
            success: function (json, resource) {
                var info = json['info'];
                var message = json['message'];
                var repo = info['owner'] + '/' + info['name'];
                var server = info['server'];
                var warning = false;
                if ("AlreadyExists" == resource) {
                } else if ("Created" == resource) {
                } else if ("TokenScopeMismatch" == resource) {
                    message = "Token you provided have no access to repository '" + repo + "', try again";
                    warning = true;
                    // TODO: Add link to refresh/request token (via popup window)
                    WH.forcePopup[server] = true
                } else if ("NoAccess" == resource) {
                    warning = true;
                } else if ("UserHaveNoAccess" == resource) {
                    warning = true;
                } else {
                    BS.Log.warn("Unexpected result: " + resource);
                    alert("Unexpected result: " + resource);
                }
                BS.Util.Messages.show(resource, message, warning ? {verbosity: 'warn'} : {});
            }
        },
        check: {
            id: "check",
            name: "Check",
            progress: "Checking WebHook",
            success: function (json, resource) {
                // TODO: Deduplicate all 'success' functions
                var info = json['info'];
                var message = json['message'];
                var repo = info['owner'] + '/' + info['name'];
                var server = info['server'];
                var warning = false;
                if ("Ok" == resource) {
                } else if ("TokenScopeMismatch" == resource) {
                    message = "Token you provided have no access to repository '" + repo + "', try again";
                    warning = true;
                    // TODO: Add link to refresh/request token (via popup window)
                    WH.forcePopup[server] = true
                } else if ("NoAccess" == resource) {
                    warning = true;
                } else if ("UserHaveNoAccess" == resource) {
                    warning = true;
                } else {
                    BS.Log.warn("Unexpected result: " + resource);
                    alert("Unexpected result: " + resource);
                }
                BS.Util.Messages.show(resource, message, warning ? {verbosity: 'warn'} : {});
            }
        },
        delete: {
            id: "delete",
            name: "Delete",
            progress: "Deleting WebHook",
            success: function (json, resource) {
                // TODO: Deduplicate all 'success' functions
                var info = json['info'];
                var message = json['message'];
                var repo = info['owner'] + '/' + info['name'];
                var server = info['server'];
                var warning = false;
                if ("Removed" == resource) {
                } else if ("NeverExisted" == resource) {
                } else if ("TokenScopeMismatch" == resource) {
                    message = "Token you provided have no access to repository '" + repo + "', try again";
                    warning = true;
                    // TODO: Add link to refresh/request token (via popup window)
                    WH.forcePopup[server] = true
                } else if ("NoAccess" == resource) {
                    warning = true;
                } else if ("UserHaveNoAccess" == resource) {
                    warning = true;
                } else {
                    BS.Log.warn("Unexpected result: " + resource);
                    alert("Unexpected result: " + resource);
                }
                BS.Util.Messages.show(resource, message, warning ? {verbosity: 'warn'} : {});
            }
        },
        connect: {
            id: "connect",
            name: "Connect",
            progress: "????CONNECT????"
        }
    };
    WH.checkLocation = function () {
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
            return false;
        }
        return true;
    };
    WH.doWebHookAction = function (action, element, type, id, popup, projectId) {
        if (!WH.checkLocation()) return;
        BS.Log.info("From arguments: " + id + ' ' + type);

        //var progress = $$("# .progress").show();

        // Enforce popup for server if needed
        var server = undefined;
        var info = WH.info[id];
        if (info) {
            server = info['server'];
        } else if (type == "repository") {
            server = WH.getServerUrl(id);
        }
        if (server && WH.forcePopup[server]) {
            popup = true
        }

        if (popup) {
            var url = window.base_uri + '/oauth/github/webhooks.html?action=' + action.id + '&popup=true&id=' + id + '&type=' + type;
            if (projectId !== undefined) {
                url = url + "&projectId=" + projectId
            }
            BS.Util.popupWindow(url, 'webhook_' + action.id + '_' + type + '_' + id);
            return
        }

        var that = element;

        // TODO: Proper message
        BS.ProgressPopup.showProgress(element, action.progress, {shift: {x: -65, y: 20}, zIndex: 100});
        var parameters = {
            "action": action.id,
            "type": type,
            "id": id,
            "popup": popup,
        };
        if (projectId !== undefined) {
            parameters["projectId"] = projectId
        }
        //noinspection JSUnusedGlobalSymbols
        BS.ajaxRequest(window.base_uri + "/oauth/github/webhooks.html", {
            method: "post",
            parameters: parameters,
            onComplete: function (transport) {
                //progress.hide();
                BS.ProgressPopup.hidePopup(0, true);

                var json = transport.responseJSON;
                if (json['redirect']) {
                    BS.Log.info("Redirect response received");
                    var link = "<a href='#' onclick=\"BS.GitHubWebHooks.doAction('" + action.id + "', this, '" + id + "','" + projectId + "', true); return false\">Refresh access token and " + action.name + " WebHook</a>";
                    BS.Util.Messages.show('redirect', 'GitHub authorization needed. ' + link);
                    //BS.Util.popupWindow(json['redirect'], 'add_webhook_' + type + '_' + id);
                    $j(that).append(link);
                    $(that).onclick = function () {
                        WH.doWebHookAction(action, that, type, id, true, projectId);
                        return false
                    };
                    BS.Log.info($(that).onclick);
                    // FIXME: Investigate why text not changed
                    $j(that).text("Refresh token and add WebHook");
                    BS.Log.info($(that).innerHTML);
                } else if (json['error']) {
                    BS.Log.error("Sad :( Something went wrong: " + json['error']);
                    alert(json['error']);
                } else if (json['result']) {
                    var res = json['result'];
                    //if ("TokenScopeMismatch" == res) {
                    //    WH.showMessage("Token you provided have no access to repository");
                    //    // TODO: Add link to refresh/request token (via popup window)
                    //    that.onclick = function (x) {
                    //        WH.addWebHook(x, '${Type}', '${Id}', true);
                    //        return false
                    //    };
                    //    //("<a href='#' onclick='BS.GitHubWebHooks.addWebHook(this, '${Type}', '${Id}', false); return false'>Refresh access token</a>");
                    //    that.innerHTML = "Refresh token and add WebHook"
                    //} else {
                    WH.processResult(json, res);
                    //}
                } else {
                    BS.Log.error("Unexpected response: " + json.toString())
                }
                WH.refreshReports();
            }
        });
    };

    WH.addConnection = function (element, projectId, serverUrl) {
        document.location.href = window.base_uri + "/admin/editProject.html?projectId=" + projectId + "&tab=oauthConnections#"
    };

    WH.processResult = function (json, res) {
        var action = WH.actions[json['action']];
        if (action) {
            if (action.success) {
                return action.success(json, res)
            }
            BS.Log.warn("There no 'success' function defined for action '" + action.id + "'");
            return "There no 'success' function defined for action '" + action.id + "'"
        }
        BS.Log.warn("Unknown action type: " + json['action']);
    };

    WH.callback = function (json) {
        if (json['error']) {
            BS.Log.error("Sad :( Something went wrong: " + json['error']);
            // Todo: show popup dialog with rich HTML instead of alert
            alert(json['error']);
        } else if (json['result']) {
            var res = json['result'];
            WH.processResult(json, res);
        } else {
            BS.Log.error("Unexpected response: " + JSON.stringify(json))
        }
        WH.refreshReports();
    };

    WH.refreshReports = function () {
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
    };

    WH.getServerUrl = function (repository) {
        var s = String(repository);
        return s.substring(0, s.lastIndexOf("/", s.lastIndexOf("/") - 1));
    };

    WH.doAction = function (name, element, repository, projectId, popup) {
        var action = WH.actions[name.toLowerCase()];
        if (!action) {
            BS.Log.error("Unknown action: " + name);
            return false;
        }
        var p;
        if (repository === undefined) {
            var data_holder = $j(element).parents("[data-repository]");
            repository = data_holder.attr('data-repository');
            projectId = data_holder.attr('data-project-id');
        }
        if (popup === undefined) {
            var fp = WH.forcePopup[WH.getServerUrl(repository)];
            if (fp === undefined) fp = true;
            p = fp
        } else {
            p = popup
        }
        WH.doWebHookAction(action, element, "repository", repository, p, projectId);
        return false;
    };
    WH.checkAll = function (element, projectId) {
        var parameters = {
            "action": 'check-all'
        };
        if (projectId) {
            parameters["projectId"] = projectId
        }
        BS.ProgressPopup.showProgress(element, "Rechecking all webhooks", {shift: {x: -65, y: 20}, zIndex: 100});
        BS.ajaxRequest(window.base_uri + "/oauth/github/webhooks.html", {
            method: "post",
            parameters: parameters,
            onComplete: function (transport) {
                BS.ProgressPopup.hidePopup(0, true);
                if (transport.status != 200) {
                    BS.Log.error("Check all responded with " + transport.status);
                    alert("Check all responded with " + transport.status);
                    return
                }
                var json = transport.responseJSON;
                if (json['error']) {
                    BS.Log.error("Sad :( Something went wrong: " + json['error']);
                    alert(json['error']);
                } else if (json['result']) {
                    var res = json['result'];
                    // TODO: Incremental update
                    window.location.reload()
                } else {
                    BS.Log.error("Unexpected response: " + json.toString())
                }
                WH.refreshReports();
            }
        })
    };

    function getStatusClass(status) {
        switch (status) {
            case "NO_INFO":
                return "no-info";
            case "NOT_FOUND":
                return "not-found";
            case "OK":
                return "good";
            case "WAITING_FOR_SERVER_RESPONSE":
                return "pending";
            case "INCORRECT":
                return "error";
            default:
                return "";
        }
    }

    function getStatusPresentation(status) {
        switch (status) {
            case "NO_INFO":
                return "No information";
            case "NOT_FOUND":
                return "Not found";
            case "OK":
                return "OK";
            case "WAITING_FOR_SERVER_RESPONSE":
                return "Waiting for ping event";
            case "INCORRECT":
                return "Incorrect";
            default:
                return status;
        }
    }

    function getStatusDiv(status) {
        var presentation = getStatusPresentation(status);
        return "<div class=\"webhook-status " + getStatusClass(status) + "\">" + presentation + "</div>"
    }

    WH.refresh = function (element, repositories) {
        if (repositories.length < 1) return;
        var parameters = {
            'action': 'get-info',
            'repository': repositories
        };
        BS.ProgressPopup.showProgress(element, "Fetching webhook(s) info", {shift: {x: -65, y: 20}, zIndex: 100});
        BS.ajaxRequest(window.base_uri + "/oauth/github/webhooks.html", {
            method: 'get',
            parameters: parameters,
            onComplete: function (transport) {
                BS.ProgressPopup.hidePopup(0, true);
                if (transport.status != 200) {
                    BS.Log.error("Fetching webhooks info responded with " + transport.status);
                    return
                }
                var json = transport.responseJSON;
                if (json['error']) {
                    BS.Log.error("Sad :( Something went wrong: " + json['error']);
                    alert(json['error']);
                } else if (json['result']) {
                    var arr = json['result'];
                    for (var i = 0; i < arr.length; i++) {
                        var r = arr[i];
                        var repository = r['repository']; // string
                        var error = r['error']; // String?
                        var info = r['info']; // VcsRootGitHubInfo?
                        var hook = r['hook']; // HookInfo?
                        var status = r['status']; // String
                        var actions = r['actions']; // List<String>

                        // Find all table rows with given repository
                        var elements = $j(element).parents("tr[data-repository='" + repository + "']");
                        // Update them
                        elements.find(".webhook-status").replaceWith(getStatusDiv(status));
                        elements.find(".webhook-actions").html(
                            actions.map(function (action) {
                                return '<div><a href="#" onclick="BS.GitHubWebHooks.doAction(\'' + action + '\', this); return false;">' + action + '</a></div>'
                            }).join("")
                        );

                    }

                } else {
                    BS.Log.error("Unexpected response: " + json.toString())
                }
                WH.refreshReports();
            }
        })
    };
})(BS.GitHubWebHooks);

BS.Util.Messages = {};
(function (Messages) {
    Messages.show = function (group, text) {
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
    };
    Messages.hide = function (options) {
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
    };

})(BS.Util.Messages);

BS.AdminActions = {};
(function (AA) {
    AA.toggleVcsRootInstanceUsages = function (link, vcsRootInstanceId) {
        $j('#instance_' + vcsRootInstanceId + '_usages').toggle();
        var parent = $j(link).parent().toggleClass("usageHl");
        parent.parent().find(".vcsRoot").toggleClass("bold");
        return false;
    };
    AA.toggleWebHookUsages = function (link, id) {
        $j('#webhook_' + id + '_usages').toggle();
        var parent = $j(link).parent().toggleClass("usageHl");
        parent.parent().find(".webHook").toggleClass("bold");
        return false;
    };
})(BS.AdminActions);


window.GitHubWebHookCallback = BS.GitHubWebHooks.callback;