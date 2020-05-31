/**
 * Created by Heshan.i on 7/22/2016.
 */

var User = require('dvp-mongomodels/model/User');
var ExternalUser = require('dvp-mongomodels/model/ExternalUser');
var UserGroup = require('dvp-mongomodels/model/UserGroup').UserGroup;
var Trigger = require('dvp-mongomodels/model/TicketTrigers').Trigger;
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var EventEmitter = require('events').EventEmitter;
var messageFormatter = require('dvp-common-lite/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var util = require('util');
var PickAgent = require('./PickAgent.js');
var DvpNotification = require('./DvpNotification.js');
var restClientHandler = require('./RestClient.js');
var SlaWorker = require('../SLA/SLAWorker.js');
var dashboardEventHandler = require('../Common/DashboardEventHandler');
var deepcopy = require("deepcopy");
var emailHandler = require('./EmailHandler.js');
var dvpInteraction = require('../Common/DvpInteractions');
var async = require('async');
var OrganisationConfig = require('dvp-mongomodels/model/OrganisationConfig');
var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;
var q = require('q');
var dvpEventsHandler = require('../Common/DVPEventsHandler.js');

function numSort(a, b) {
    return a.priority - b.priority;
}

function UniqueObjectArray(array, field) {
    var processed = [];
    for (var i = array.length - 1; i >= 0; i--) {
        if (processed.indexOf(array[i][field]) < 0) {
            processed.push(array[i][field]);
        } else {
            array.splice(i, 1);
        }
    }
    return array;
}

function GenerateFilterRegex(value) {
    if (value) {
        var regexStr = "";
        var tagArray = value.split(".");
        if (tagArray.length > 0) {
            if (tagArray[i] === "*") {
                regexStr = util.format("^%s", "([A-Z]*[a-z]*)*");
            } else {
                regexStr = util.format("^(%s)", tagArray[0]);
            }
        }

        for (var i = 1; i < tagArray.length; i++) {
            if (tagArray[i] === "*") {
                regexStr = util.format("%s[.]%s", regexStr, "([A-Z]*[a-z]*)*");
            } else {
                regexStr = util.format("%s[.](%s)", regexStr, tagArray[i]);
            }
        }
        return util.format("%s[^\s]*", regexStr);
    } else {
        return value;
    }
}

function UpdateDashboardChangeStatus(data, tResult, callback) {
    var assignee = tResult.assignee ? tResult.assignee.username : "";
    var assignee_group = tResult.assignee_group ? tResult.assignee_group.name : "";
    data = data ? data : "";

    //var param1 = util.format("via_%s.tags_%s.user_%s.ugroup_%s", tResult.channel, tResult.tags.join("-"), assignee, assignee_group);
    //var param2 = util.format("user_%s#ugroup_%s", assignee, assignee_group);

    var eventTime = new Date().toISOString();
    var asyncPubKeys = [];
    var asyncPubTask = [];



    if (tResult && tResult.status === "closed" && tResult.ticket_matrix.external_replies && tResult.ticket_matrix.external_replies === 0) {
        //var pubMsgEFirstCallResolution = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "firstCallResolution", "total", "total", "Total" + tResult._id);

        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "firstCallResolution", "total", "total", "Total" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
    }

    if (tResult && tResult.status === "new") {
        //run ticket resolve time
        //var pubMsgNResolution = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "RESOLUTION", "new", "total", "total", "Total" + tResult._id);

        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "RESOLUTION", "new", "total", "total", "Total" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
    }

    if (tResult && tResult.status === "closed") {
        //stop ticket resolve time
        //var pubMsgEResolution = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "RESOLUTION", "closed", "total", "total", "Total" + tResult._id);

        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "RESOLUTION", "closed", "total", "total", "Total" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
    }

    if (tResult && data && data === "closed" && tResult.status === "open") {
        //rerun ticket resolve time
        //var pubMsgNRResolution = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "RESOLUTION", "new", "total", "total", "Total" + tResult._id);

        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "RESOLUTION", "new", "total", "total", "Total" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });

        //set ticket reopn count
        // var pubMsgNReopen = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "Reopen", "total", "total", "Total" + tResult._id);
        // var pubMsgNRChannel = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "Reopen", "via_" + tResult.channel, "param2", "Channel" + tResult._id);
        // var pubMsgNRTags = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "Reopen", "tags_" + tResult.tags.join(".").replace(/ /g, ''), "param2", "Tags" + tResult._id);
        // var pubMsgNRUser = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "Reopen", "user_" + assignee, "param2", "User" + tResult._id);
        // var pubMsgNRUGroup = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "Reopen", "ugroup_" + assignee_group, "param2", "UGroup" + tResult._id);

        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "Reopen", "total", "total", "Total" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "Reopen", "via_" + tResult.channel, "param2", "Channel" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "Reopen", "tags_" + tResult.tags.join(".").replace(/ /g, ''), "param2", "Tags" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "Reopen", "user_" + assignee, "param2", "User" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "Reopen", "ugroup_" + assignee_group, "param2", "UGroup" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
    }

    if (tResult && data && tResult.status != "new") {
        // var pubMsgETotal = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End" + data, "total", "total", "Total" + tResult._id);
        // var pubMsgEChannel = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End" + data, "via_" + tResult.channel, "param2", "Channel" + tResult._id);
        // var pubMsgETags = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End" + data, "tags_" + tResult.tags.join(".").replace(/ /g, ''), "param2", "Tags" + tResult._id);
        // var pubMsgEUser = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End" + data, "user_" + assignee, "param2", "User" + tResult._id);
        // var pubMsgEUGroup = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End" + data, "ugroup_" + assignee_group, "param2", "UGroup" + tResult._id);
        //
        //
        // asyncPubKeys.push(pubMsgETotal);
        // asyncPubKeys.push(pubMsgEChannel);
        // asyncPubKeys.push(pubMsgETags);
        // asyncPubKeys.push(pubMsgEUser);
        // asyncPubKeys.push(pubMsgEUGroup);

        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "End" + data, "total", "total", "Total" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "End" + data, "via_" + tResult.channel, "param2", "Channel" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "End" + data, "tags_" + tResult.tags.join(".").replace(/ /g, ''), "param2", "Tags" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "End" + data, "user_" + assignee, "param2", "User" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });
        asyncPubTask.push(function (callback) {
            dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "End" + data, "ugroup_" + assignee_group, "param2", "UGroup" + tResult._id, eventTime).then(function (pResult) {
                callback(null, pResult);
            }).catch(function (ex) {
                callback(ex, null);
            });
        });

    }

    //create new window ==> until close
    // var pubMsgNTotal = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, "total", "total", "Total" + tResult._id);
    // var pubMsgNChannel = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, "via_" + tResult.channel, "param2", "Channel" + tResult._id);
    // var pubMsgNTags = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, "tags_" + tResult.tags.join(".").replace(/ /g, ''), "param2", "Tags" + tResult._id);
    // var pubMsgNUser = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, "user_" + assignee, "param2", "User" + tResult._id);
    // var pubMsgNUGroup = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, "ugroup_" + assignee_group, "param2", "UGroup" + tResult._id);
    //
    // asyncPubKeys.push(pubMsgNTotal);
    // asyncPubKeys.push(pubMsgNChannel);
    // asyncPubKeys.push(pubMsgNTags);
    // asyncPubKeys.push(pubMsgNUser);
    // asyncPubKeys.push(pubMsgNUGroup);

    asyncPubTask.push(function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", tResult.status, "total", "total", "Total" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    });
    asyncPubTask.push(function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", tResult.status, "via_" + tResult.channel, "param2", "Channel" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    });
    asyncPubTask.push(function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", tResult.status, "tags_" + tResult.tags.join(".").replace(/ /g, ''), "param2", "Tags" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    });
    asyncPubTask.push(function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", tResult.status, "user_" + assignee, "param2", "User" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    });
    asyncPubTask.push(function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", tResult.status, "ugroup_" + assignee_group, "param2", "UGroup" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    });

    // asyncPubKeys.forEach(function (pubKey) {
    //     asyncPubTask.push(function (callback) {
    //         redisHandler.Publish("events", pubKey, function (err, result) {
    //             callback(err, result);
    //         });
    //     });
    // });

    async.parallelLimit(asyncPubTask, 2,function(err, result) {
        console.log("Message Publish success");
        callback(err, result);
    });

}

function UpdateDashboardChangeAssignee(data, tResult, callback) {
    var assignee = tResult.assignee ? tResult.assignee.username : "";
    data = data ? data : "";

    // var pubMsgEUser = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End" + tResult.status, "user_" + data, "param2", "User" + tResult._id);
    // var pubMsgNUser = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, "user_" + assignee, "param2", "User" + tResult._id);

    var eventTime = new Date().toISOString();
    var asyncPubTask = [];
    asyncPubTask = asyncPubTask.concat([function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "End" + tResult.status, "user_" + data, "param2", "User" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    },function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", tResult.status, "user_" + assignee, "param2", "User" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    }]);

    async.parallelLimit(asyncPubTask, 2,function(err, result) {
        console.log("Message Publish success");
        callback(err, result);
    });
}

function UpdateDashboardChangeAssigneeGroup(data, tResult, callback) {
    //var assignee = tResult.assignee? tResult.assignee: "";
    var assignee_group = tResult.assignee_group ? tResult.assignee_group.name : "";
    data = data ? data : "";

    //var param1 = util.format("via_%s.tags_%s.user_%s.ugroup_%s", tResult.channel, tResult.tags.join("-"), assignee, data);
    //var param2 = util.format("user_%s#ugroup_%s", assignee, data);

    // var pubMsgEUGroup = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End" + tResult.status, "ugroup_" + data, "param2", "UGroup" + tResult._id);
    // var pubMsgNUGroup = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, "ugroup_" + assignee_group, "param2", "UGroup" + tResult._id);

    var eventTime = new Date().toISOString();
    var asyncPubTask = [];
    asyncPubTask = asyncPubTask.concat([function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", "End" + tResult.status, "ugroup_" + data, "param2", "UGroup" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    },function (callback) {
        dashboardEventHandler.PublishEvent(tResult.tenant, tResult.company, tResult.businessUnit, "TICKET", "STATUS", tResult.status, "ugroup_" + assignee_group, "param2", "UGroup" + tResult._id, eventTime).then(function (pResult) {
            callback(null, pResult);
        }).catch(function (ex) {
            callback(ex, null);
        });
    }]);

    async.parallelLimit(asyncPubTask, 2,function(err, result) {
        console.log("Message Publish success");
        callback(err, result);
    });
}

function ExecuteOperations(ticketData, operationToExecute) {
    //TODO : Replace switch with npm architect
    console.log("operationToExecute:: " + operationToExecute.name);
    switch (operationToExecute.name) {
        case "AddInteraction":
            dvpInteraction.AddInteraction(ticketData, operationToExecute.value);
            break;
        case "SendMessage":
            emailHandler.SendMessage(ticketData, operationToExecute.field, operationToExecute.value, "SMSOUT", function () {
            });
            break;
        case "PickAgent":
            var attributeIds = operationToExecute.value;
            PickAgent.AddRequest(ticketData.tenant, ticketData.company, ticketData._id, attributeIds, "1", "", function () {
            });
            break;
        case "SendEmail":
            emailHandler.SendMessage(ticketData, operationToExecute.field, operationToExecute.value, "EMAILOUT", function () {
            });
            break;
        case "SendNotification":
            DvpNotification.SendNotification(ticketData, operationToExecute.field, operationToExecute.value);
            break;
        case "InvokeService":
            var internalAccessToken = util.format("%d:%d", ticketData.tenant, ticketData.company);
            var reqUrl = operationToExecute.field;
            var reqData = operationToExecute.value.data;
            var reqMethod = operationToExecute.value.method;
            switch (reqMethod) {
                case "POST":
                    restClientHandler.DoPost(internalAccessToken, reqUrl, reqData, function () {
                    });
                    break;
                case "PUT":
                    restClientHandler.DoPut(internalAccessToken, reqUrl, reqData, function () {
                    });
                    break;
                case "GET":
                    restClientHandler.DoGet(internalAccessToken, reqUrl, function () {
                    });
                    break;
                case "DELETE":
                    restClientHandler.DoDelete(internalAccessToken, reqUrl, function () {
                    });
                    break;
                default :
                    break;
            }
            break;
        default :
            break;
    }
}

function ValidateUser(obj, trigger, newAssignee, callback) {
    
    console.log(obj);
    console.log(newAssignee);
    
    try {
        User.findOne({_id: newAssignee}, function (err, uResult) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                console.log(jsonString);
            } else {
                if (uResult && uResult.company === trigger.company && uResult.tenant === trigger.tenant) {
                    var previousAssignee = deepcopy(obj.assignee);
                    obj.assignee = uResult._id;

                    var time = new Date().toISOString();

                    if (obj.ticket_matrix) {
                        obj.ticket_matrix.last_assigned = time;
                        obj.ticket_matrix.last_updated = time;

                        if (obj.ticket_matrix.assignees)
                            obj.ticket_matrix.assignees ++;
                        else
                            obj.ticket_matrix.assignees = 1;
                    }


                    UpdateDashboardChangeAssignee(previousAssignee, obj, function (err, result) {
                        
                    });
                } else {
                    jsonString = messageFormatter.FormatMessage(err, "No User found", false, undefined);
                    console.log(jsonString);
                }
            }
            callback(obj);
        });
    } catch (ex) {
        console.log(ex);
        callback(obj);
    }
}

function ValidateGroup(obj, trigger, newGroup, callback) {
    try {
        UserGroup.findOne({_id: newGroup}, function (err, ugResult) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get UserGroup Failed", false, undefined);
                console.log(jsonString);
            } else {
                if (ugResult && ugResult.company === trigger.company && ugResult.tenant === trigger.tenant) {
                    var previousGroup = deepcopy(obj.assignee_group);
                    obj.assignee_group = ugResult._id;

                    var time = new Date().toISOString();

                    if (obj.ticket_matrix) {
                        obj.ticket_matrix.last_assigned = time;
                        obj.ticket_matrix.last_updated = time;

                        if (obj.ticket_matrix.assignees)
                            obj.ticket_matrix.assignees++;
                        else
                            obj.ticket_matrix.assignees = 1;
                    }


                    UpdateDashboardChangeAssigneeGroup(previousGroup, obj, function (err, result) {

                    });
                } else {
                    jsonString = messageFormatter.FormatMessage(err, "No UserGroup found", false, undefined);
                    console.log(jsonString);
                }
            }
            callback(obj);
        });
    } catch (ex) {
        console.log(ex);
        callback(obj);
    }
}

function ValidateAssigneeAndGroup(obj, trigger, newAssignee, newGroup) {
    var e = new EventEmitter();
    process.nextTick(function () {
        if (newAssignee != "" && newGroup != "") {
            ValidateGroup(obj, trigger, newGroup, function (rugObj) {
                ValidateUser(rugObj, trigger, newAssignee, function (ruObj) {
                    e.emit('validateUserAndGroupDone', ruObj);
                });
            });
        } else if (newAssignee != "") {
            ValidateUser(obj, trigger, newAssignee, function (ruObj) {
                e.emit('validateUserAndGroupDone', ruObj);
            });
        } else if (newGroup != "") {
            ValidateGroup(obj, trigger, newGroup, function (rugObj) {
                e.emit('validateUserAndGroupDone', rugObj);
            });
        } else {
            e.emit('validateUserAndGroupDone', obj);
        }
    });

    return (e);
}

function AggregateCondition(obj, field, value, operator, callback) {
    try {
        if (value === "true") {
            value = true;
        } else if (value === "false") {
            value = false;
        }

        var paths = Ticket.schema.paths;
        var ticketvalue = obj[field];
        if (paths && paths[field] && (field != 'tags')) {
            if ((typeof obj[field]) == (typeof {})) {
                value = new global[paths[field].instance](value);
                ticketvalue = new global[paths[field].instance](ticketvalue);
            }

        }

        switch (operator) {
            case "is":
                callback(ticketvalue === value);
                break;
            case "less_than":
                callback(ticketvalue < value);
                break;
            case "greater_than":
                callback(ticketvalue > value);
                break;
            case "is_not":
                callback(ticketvalue != value);
                break;
            case "included":
                if (field === "tags") {
                    var pattern_i = new RegExp(GenerateFilterRegex(value));
                    callback(pattern_i.test(obj[field]));
                } else {
                    callback(obj[field].indexOf(value) > -1);
                }
                break;
            case "not_included":
                if (field === "tags") {
                    var pattern_ni = new RegExp(GenerateFilterRegex(value));
                    callback(!pattern_ni.test(obj[field]));
                } else {
                    if(field=="requester")
                    {
                        callback(true);
                    }
                    else
                    {
                        callback(obj[field].indexOf(value) === -1);
                    }

                }
                break;
            case "greater_than_or_equal":
                //var temp = typeof obj[field];
                callback(ticketvalue >= value);
                break;
            case "less_than_or_equal":
                callback(ticketvalue <= value);
                break;
            default :
                callback(false);
                break;
        }
    } catch (ex) {
        callback(false);
    }
}

function ExecuteAndOperation(obj, trigger, callback) {
    if (trigger.conditions.all && trigger.conditions.all.length > 0) {
        var eCount = 0;
        var isDone = false;
        for (var i = 0; i < trigger.conditions.all.length; i++) {
            var condition = trigger.conditions.all[i];
            AggregateCondition(obj, condition.field, condition.value, condition.operator, function (aResult) {
                eCount++;
                if (!isDone && aResult === false) {
                    callback(true, false, trigger);
                    isDone = true;
                    //break;
                }
                if (!isDone && eCount === trigger.conditions.all.length) {
                    callback(true, true, trigger);
                }
            });
        }
    } else {
        callback(false, false, trigger);
    }
}

function ExecuteOrOperation(obj, trigger, callback) {
    if (trigger.conditions.any && trigger.conditions.any.length > 0) {
        var eCount = 0;
        var isDone = false;
        for (var i = 0; i < trigger.conditions.any.length; i++) {
            var condition = trigger.conditions.any[i];
            AggregateCondition(obj, condition.field, condition.value, condition.operator, function (aResult) {
                eCount++;
                if (!isDone && aResult === true) {
                    callback(true, true, trigger);
                    isDone = true;
                    //break;
                }
                if (!isDone && eCount === trigger.conditions.any.length) {
                    callback(true, false, trigger);
                }
            });
        }
    } else {
        callback(false, false, trigger);
    }
}

function MatchTriggers(obj, triggers) {
    var e = new EventEmitter();
    process.nextTick(function () {
        if (triggers && triggers.length > 0) {
            var allCount = 0;
            var anyCount = 0;
            for (var i = 0; i < triggers.length; i++) {
                var trigger = triggers[i];
                ExecuteAndOperation(obj, trigger, function (accept, match, rTrigger) {
                    allCount++;
                    if (accept && match) {
                        e.emit('trigger', rTrigger);
                    }
                    if (triggers.length === allCount && triggers.length === anyCount) {
                        e.emit('endMatchingTriggers');
                    }
                });
                ExecuteOrOperation(obj, trigger, function (accept, match, rTrigger) {
                    anyCount++;
                    if (accept && match) {
                        e.emit('trigger', rTrigger);
                    }
                    if (triggers.length === allCount && triggers.length === anyCount) {
                        e.emit('endMatchingTriggers');
                    }
                });
            }
        }
        else {
            e.emit('endMatchingTriggers');
        }
    });

    return (e);
}

function ExecuteTrigger(ticketId, triggerEvent, data, sendResult) {
    var jsonString;

    if (ticketId) {
        try {
            Ticket.findOne({_id: ticketId}).populate('requester', '-password').populate('submitter', '-password').populate('assignee', '-password').populate('assignee_group collaborators watchers attachments comments').populate('form_submission').lean().exec(function (err, tResult) {
                //Ticket.findOne({_id: ticketId},function (err, tResult) {


                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Get Ticket Failed", false, undefined);
                    sendResult(jsonString);
                } else {
                    if (tResult) {

                        var ticketCopy = deepcopy(tResult);

                        dvpEventsHandler.PublishEvent(ticketCopy, triggerEvent, data, null, false);
                        var preOperationsTasks = [];


                        if (triggerEvent === "change_assignee") {

                            preOperationsTasks = preOperationsTasks.concat([
                                function (callback) {
                                    PickAgent.UpdateSlotState(ticketCopy.company, ticketCopy.tenant, triggerEvent, data, ticketCopy.assignee, ticketCopy._id, function (err, result) {

                                        callback(err, result);
                                    });
                                },
                                function (callback) {
                                    UpdateDashboardChangeAssignee(data, ticketCopy, function (err, result) {
                                        callback(err, result);
                                    });
                                }
                            ]);

                        } else if (triggerEvent === "change_status") {
                            if (ticketCopy.assignee && ticketCopy.status === "closed") {
                                preOperationsTasks.push(function (callback) {
                                    PickAgent.UpdateSlotState(ticketCopy.company, ticketCopy.tenant, triggerEvent, data, ticketCopy.assignee, ticketCopy._id, function (err, result) {

                                        callback(err, result);
                                    });
                                });
                            }

                            preOperationsTasks = preOperationsTasks.concat([
                                function (callback) {
                                    SlaWorker.UpdateSLAWhenStateChange(ticketCopy, function (result) {

                                        callback(result);
                                    });
                                },
                                function (callback) {
                                    UpdateDashboardChangeStatus(data, ticketCopy, function (err, result) {

                                        callback(err, result);
                                    });
                                }
                            ]);

                        } else if (triggerEvent === "change_assignee_groups") {

                            preOperationsTasks.push(function (callback) {
                                UpdateDashboardChangeAssigneeGroup(data, ticketCopy, function (err, result) {
                                    callback(err, result);
                                });
                            });

                        } else if (triggerEvent === "add_comment") {
                            ticketCopy.last_comment = data;
                        }

                        async.parallel(preOperationsTasks, function (err, results) {
                            var message = results? JSON.stringify(results): undefined;
                            console.log("ExecutePreOperationsTasks Success: "+message);
                        });


                        function ExecuteSelectedTrigger(err, trResult) {
                            if (err) {
                                jsonString = messageFormatter.FormatMessage(err, "Find Trigger Failed", false, undefined);
                                sendResult(jsonString);
                            } else {
                                if (trResult) {

                                    function ExecuteCondition(triggerToExecute, callbackparallel) {
                                        try {

                                            if (triggerToExecute) {
                                                if (triggerToExecute.actions.length > 0) {
                                                    var newAssignee = "";
                                                    var newAssignee_group = "";

                                                    //var asyncvalidateUserAndGroupTasks = [];
                                                    triggerToExecute.actions.forEach(function (action) {
                                                        //asyncvalidateUserAndGroupTasks.push(function (callback) {
                                                            switch (action.field) {
                                                                case "assignee":
                                                                    newAssignee = action.value;
                                                                    break;
                                                                case "assignee_group":
                                                                    newAssignee_group = action.value;
                                                                    break;
                                                                default :
                                                                    tResult[action.field] = action.value;
                                                                    if (action.field === "status") {
                                                                        UpdateDashboardChangeStatus(ticketCopy.status, tResult, function (err, result) {

                                                                        });
                                                                    }
                                                                    break;
                                                            }
                                                            //callback(tResult, newAssignee, newAssignee_group);
                                                        //});
                                                    });
                                                    //async.parallel(asyncvalidateUserAndGroupTasks, function (result, assignee, assigneeGroup) {
                                                        //console.log("asyncvalidateUserAndGroupTasks: ");
                                                        var vag = ValidateAssigneeAndGroup(tResult, triggerToExecute, newAssignee, newAssignee_group);
                                                        vag.on('validateUserAndGroupDone', function (updatedTicket) {
                                                            Ticket.findOneAndUpdate({_id: ticketId}, updatedTicket, function (err, utResult) {
                                                                if (err) {
                                                                    console.log("Update ticket Failed: " + err);
                                                                } else {
                                                                    console.log("Update ticket Success: " + utResult);
                                                                }
                                                            });
                                                        });
                                                    //});

                                                }

                                                if (triggerToExecute.operations.length > 0) {
                                                    var asyncExecuteOperationsTasks = [];
                                                    triggerToExecute.operations.forEach(function (operationToExecute) {
                                                        // We don't actually execute the async action here
                                                        // We add a function containing it to an array of "tasks"
                                                        asyncExecuteOperationsTasks.push(function (callback) {
                                                            ExecuteOperations(ticketCopy, operationToExecute);
                                                            callback();
                                                        });
                                                    });
                                                    async.parallel(asyncExecuteOperationsTasks, function () {
                                                        console.log("ExecuteOperations Success: ");
                                                    });

                                                }
                                                jsonString = messageFormatter.FormatMessage(undefined, "Trigger Execute Success", true, undefined);
                                                callbackparallel(undefined, jsonString);
                                            } else {
                                                jsonString = messageFormatter.FormatMessage(undefined, "No active trigger found", false, undefined);
                                                callbackparallel(undefined, jsonString);
                                            }
                                        }
                                        catch (ex) {
                                            jsonString = messageFormatter.FormatMessage(ex, "No active trigger found", false, undefined);
                                            callbackparallel(ex, jsonString);
                                        }
                                    }

                                    var asyncTasks = [];
                                    trResult.forEach(function (trigger) {
                                        asyncTasks.push(function (callbackparallel) {

                                            var conditionCollection = [];
                                            if (trigger.conditions.all && trigger.conditions.all.length > 0) {
                                                conditionCollection.push(function (callback) {
                                                    async.every(trigger.conditions.all, function (condition, callback) {
                                                        AggregateCondition(tResult, condition.field, condition.value, condition.operator, function (aResult) {
                                                            callback(undefined, aResult);
                                                        });
                                                    }, function (err, results) {
                                                        callback(null, results);
                                                    });
                                                })
                                            }
                                            if (trigger.conditions.any && trigger.conditions.any.length > 0) {
                                                conditionCollection.push(function (callback) {
                                                    async.some(trigger.conditions.any, function (condition, callback) {
                                                        AggregateCondition(tResult, condition.field, condition.value, condition.operator, function (aResult) {
                                                            callback(undefined, aResult);
                                                        });
                                                    }, function (err, results) {
                                                        callback(null, results);
                                                    });
                                                })
                                            }
                                            async.parallel(conditionCollection,
                                                function (err, results) {
                                                    var dd = {
                                                        data: trigger,

                                                        result: results.length == 2 ? (results[0] * results[1]) : (results.length == 0 ? false : results[0])
                                                    };
                                                    callbackparallel(undefined, dd);
                                                });
                                        });

                                    });

                                    /*execution sequentially*/
                                    if(asyncTasks.length >0) {
                                        async.series(asyncTasks, function (err, results) {
                                            if (results) {
                                                var taskList = [];
                                                results.forEach(function (item) {
                                                    if (item && item.result) {
                                                        taskList.push(function (callback) {
                                                            ExecuteCondition(item.data, callback);
                                                        });
                                                    }
                                                });

                                                if (taskList.length > 0) {
                                                    async.series(taskList, function (err, results) {
                                                        console.log("Process Complete");
                                                        jsonString = messageFormatter.FormatMessage(undefined, "Accept trigger executions", true, undefined);
                                                        sendResult(jsonString);
                                                    });

                                                }else{
                                                    jsonString = messageFormatter.FormatMessage(undefined, "No matching trigger found", false, undefined);
                                                    sendResult(jsonString);
                                                }
                                            }

                                        });
                                    }else{
                                        jsonString = messageFormatter.FormatMessage(undefined, "No matching trigger found", false, undefined);
                                        sendResult(jsonString);
                                    }

                                } else {
                                    jsonString = messageFormatter.FormatMessage(undefined, "ExecuteTrigger Failed, Trigger object is null", false, undefined);
                                    sendResult(jsonString);
                                }
                            }
                        }

                        var query = {
                            $and: [{company: tResult.company}, {tenant: tResult.tenant}, {triggerEvent: triggerEvent}, {Active: true}]
                        };
                        if (triggerConfig[tResult.company]) {
                            if (triggerConfig[tResult.company].highPriority_match) {
                                Trigger.find(query, function (err, trResult) {
                                    ExecuteSelectedTrigger(err, trResult);
                                }).sort({priority: -1, updated_at: -1}).limit(1);
                            }
                            else {
                                Trigger.find(query, function (err, trResult) {
                                    ExecuteSelectedTrigger(err, trResult);
                                }).sort({priority: -1, updated_at: -1});
                            }
                        }
                        else {
                            Trigger.find(query, function (err, trResult) {
                                ExecuteSelectedTrigger(err, trResult);
                            }).sort({priority: -1, updated_at: -1});
                        }

                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "ExecuteTrigger Failed, package object is null", false, undefined);
                        sendResult(jsonString);
                    }
                }
            });
        } catch (ex) {
            console.log(ex);
            jsonString = messageFormatter.FormatMessage(ex, "ExecuteTrigger Failed", false, undefined);
            sendResult(jsonString);
        }
    } else {
        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID", false, undefined);
        sendResult(jsonString);
    }
}

function ExecuteTriggerWithSpecificOperations(ticketId, triggerEvent, data, operations, callback) {
    var jsonString;

    if (ticketId) {
        try {
            Ticket.findOne({_id: ticketId}).populate('requester', '-password').populate('submitter', '-password').populate('assignee', '-password').populate('assignee_group collaborators watchers attachments comments').lean().exec(function (err, tResult) {
                //Ticket.findOne({_id: ticketId},function (err, tResult) {
                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Get Ticket Failed", false, undefined);
                    callback(jsonString);
                } else {
                    if (tResult) {

                        var ticketCopy = deepcopy(tResult);

                        if (triggerEvent === "change_assignee") {
                            PickAgent.UpdateSlotState(tResult.company, tResult.tenant, triggerEvent, data, tResult.assignee, tResult._id, function (err, result) {

                            });
                            UpdateDashboardChangeAssignee(data, tResult, function (err, result) {
                            });
                        } else if (triggerEvent === "change_status") {
                            if (tResult.status === "closed") {
                                PickAgent.UpdateSlotState(tResult.company, tResult.tenant, triggerEvent, data, tResult.assignee, tResult._id, function (err, result) {

                                });
                            }
                            SlaWorker.UpdateSLAWhenStateChange(tResult, function (result) {

                            });
                            UpdateDashboardChangeStatus(data, tResult, function (err, result) {

                            });
                        } else if (triggerEvent === "change_assignee_groups") {
                            UpdateDashboardChangeAssigneeGroup(data, tResult, function (err, result) {
                            });
                        } else if (triggerEvent === "add_comment") {
                            ticketCopy.last_comment = data;
                        }

                        if (operations && operations.length > 0) {
                            for (var j = 0; j < operations.length; j++) {
                                var operationToExecute = operations[j];
                                ExecuteOperations(ticketCopy, operationToExecute);
                            }
                        }

                        jsonString = messageFormatter.FormatMessage(undefined, "ExecuteTrigger Success", true, undefined);
                        callback(jsonString);
                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "ExecuteTrigger Failed, package object is null", false, undefined);
                        callback(jsonString);
                    }
                }
            });
        } catch (ex) {
            console.log(ex);
            jsonString = messageFormatter.FormatMessage(ex, "ExecuteTrigger Failed", false, undefined);
            callback(jsonString);
        }
    } else {
        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID", false, undefined);
        callback(jsonString);
    }
}



var triggerConfig = [];
module.exports.LoadOrgConfig = function () {

    try {
        OrganisationConfig.find({}, function (err, config) {
            try {
                if (config) {
                    config.map(function (item) {
                        if (item) {
                            triggerConfig[item.company] = item;
                        }
                    })
                }

            } catch (ex) {

            }
        });
    }
    catch (ex) {

    }

};

module.exports.GetOrgConfig = function (company, tenant) {

    var deferred = q.defer();

    try {
        OrganisationConfig.findOne({company: company, tenant: tenant}, function (err, config) {
            try {
                triggerConfig[company] = config;
            } catch (ex) {

            }
            deferred.resolve(config);
        });
    }
    catch (ex) {
        deferred.reject(ex);
    }
    return deferred.promise;
};

module.exports.TriggerConfig = triggerConfig;
module.exports.ExecuteTrigger = ExecuteTrigger;
module.exports.ExecuteOperations = ExecuteOperations;
module.exports.ExecuteTriggerWithSpecificOperations = ExecuteTriggerWithSpecificOperations;
