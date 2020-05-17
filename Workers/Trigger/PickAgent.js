/**
 * Created by Heshan.i on 7/14/2016.
 */
var validator = require('validator');
var config = require('config');
var restClientHandler = require('./RestClient.js');
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var deepcopy = require('deepcopy');
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var TicketEvent = require('dvp-mongomodels/model/Ticket').TicketEvent;
var User = require('dvp-mongomodels/model/User');
var TriggerWorker = require('./TriggerWorker.js');
var util = require('util');
var async = require('async');

function RegisterWithArds(callback){
    try {
        var serverId = util.format("TICKET_%s", config.Host.port);
        var callbackUrl = util.format("http://%s/DVP/API/%s/Ticket/ArdsCallback", config.LBServer.ip, config.Host.version);
        var addReqServerUrl = util.format("http://%s/DVP/API/%s/ARDS/requestserver", config.Services.ardsServiceHost, config.Services.ardsServiceVersion);
        if (validator.isIP(config.LBServer.ip)) {
            callbackUrl = util.format("http://%s:%s/DVP/API/%s/Ticket/ArdsCallback", config.LBServer.ip, config.LBServer.port, config.Host.version);
        }
        if (config.Services.dynamicPort || validator.isIP(config.Services.routingServiceHost)) {
            addReqServerUrl = util.format("http://%s:%s/DVP/API/%s/ARDS/requestserver", config.Services.ardsServiceHost, config.Services.ardsServicePort, config.Services.ardsServiceVersion);
        }
        var reqData = {
            ServerType: "TICKETSERVER",
            RequestType: "TICKET",
            CallbackUrl: callbackUrl,
            CallbackOption: "POST",
            QueuePositionCallbackUrl: "",
            ReceiveQueuePosition: false,
            ServerID: serverId
        };

        restClientHandler.DoPost("", addReqServerUrl, reqData, function (err, res1, result) {
            if (err) {
                console.log(err);
                callback(false);
            }
            else {
                console.log("Add Request Server Success");
                callback(true);
            }
        });
    }catch(ex){
        callback(false);
    }
}

function AddRequest(tenant, company, sessionId, attributeId, priority, otherInfo, callback){
    var serverId = util.format("TICKET_%s", config.Host.port);
    var internalAccessToken = util.format("%d:%d", tenant, company);
    var ardsRequest = {
        ServerType:"TICKETSERVER",
        RequestType:"TICKET",
        SessionId:sessionId,
        Attributes:attributeId,
        RequestServerId:serverId,
        Priority:priority,
        ResourceCount:1,
        OtherInfo:otherInfo
    };

    var addReqUrl = util.format("http://%s/DVP/API/%s/ARDS/request", config.Services.ardsServiceHost, config.Services.ardsServiceVersion);
    if (config.Services.dynamicPort || validator.isIP(config.Services.ardsServiceHost)) {
        addReqUrl = util.format("http://%s:%s/DVP/API/%s/ARDS/request", config.Services.ardsServiceHost, config.Services.ardsServicePort, config.Services.ardsServiceVersion);
    }
    restClientHandler.DoPost(internalAccessToken, addReqUrl, ardsRequest, function (err, res1, result) {
        if (err) {
            console.log(err);
            callback(false);
        }
        else {
            console.log("Add Request Success");
            callback(true);
        }
    });
}

function RemoveRequest(tenant, company, sessionId, reason, callback){
    var internalAccessToken = util.format("%s:%s", tenant, company);
    var addReqRemoveUrl = util.format("http://%s/DVP/API/%s/ARDS/request/%s/%s", config.Services.ardsServiceHost, config.Services.ardsServiceVersion, sessionId, reason);
    if (config.Services.dynamicPort || validator.isIP(config.Services.ardsServiceHost)) {
        addReqRemoveUrl = util.format("http://%s:%s/DVP/API/%s/ARDS/request/%s/%s", config.Services.ardsServiceHost, config.Services.ardsServicePort, config.Services.ardsServiceVersion, sessionId, reason);
    }
    restClientHandler.DoDelete(internalAccessToken, addReqRemoveUrl, function (err, res1, result) {
        if (err) {
            console.log(err);
            callback(false);
        }
        else {
            console.log("Remove Request Success");
            callback(true);
        }
    });
}

function RejectRequest(tenant, company, sessionId, reason, callback){
    var internalAccessToken = util.format("%d:%d", tenant, company);
    var addReqRemoveUrl = util.format("http://%s/DVP/API/%s/ARDS/request/%s/reject/%s", config.Services.ardsServiceHost, config.Services.ardsServiceVersion, sessionId, reason);
    if (config.Services.dynamicPort || validator.isIP(config.Services.ardsServiceHost)) {
        addReqRemoveUrl = util.format("http://%s:%s/DVP/API/%s/ARDS/request/%s/reject/%s", config.Services.ardsServiceHost, config.Services.ardsServicePort, config.Services.ardsServiceVersion, sessionId, reason);
    }
    restClientHandler.DoDelete(internalAccessToken, addReqRemoveUrl, function (err, res1, result) {
        if (err) {
            console.log(err);
            callback(false);
        }
        else {
            console.log("Reject Request Success");
            callback(true);
        }
    });
}

function UpdateSlotState(company, tenant, triggerType, previousUserId, newUserId, ticketId, callback){
    var internalAccessToken = util.format("%d:%d", tenant, company);
    var slotUpdateTask = [];
    if(triggerType === "change_assignee" && previousUserId){
        slotUpdateTask.push(function (slotUpdateTaskCallback) {
            try {
                User.findOne({_id: previousUserId, company: company, tenant: tenant}, function (err, preUser) {
                    if (err) {
                        console.log("Get preUser Failed");
                        slotUpdateTaskCallback(err, "Get preUser Failed");
                    } else {
                        if (preUser && preUser.resourceid) {
                            var preUserData = {RequestType: "TICKET", State: "Available", Reason: "", OtherInfo: ""};
                            var preUserUrl = util.format("http://%s/DVP/API/%s/ARDS/resource/%s/concurrencyslot/session/%s", config.Services.ardsServiceHost, config.Services.ardsServiceVersion, preUser.resourceid, ticketId);
                            if (config.Services.dynamicPort || validator.isIP(config.Services.ardsServiceHost)) {
                                preUserUrl = util.format("http://%s:%s/DVP/API/%s/ARDS/resource/%s/concurrencyslot/session/%s", config.Services.ardsServiceHost, config.Services.ardsServicePort, config.Services.ardsServiceVersion, preUser.resourceid, ticketId);
                            }
                            restClientHandler.DoPut(internalAccessToken, preUserUrl, preUserData, function (err, res1, result) {
                                if (err) {
                                    console.log(err);
                                    slotUpdateTaskCallback(err, "Update Slot State Failed");
                                }
                                else {
                                    console.log("Update preUser Success");
                                    slotUpdateTaskCallback(undefined, "Update preUser Success");
                                }
                            });
                        } else {
                            console.log("preUser Not match with resource");
                            slotUpdateTaskCallback(undefined, "preUser Not match with resource");
                        }
                    }
                });
            }catch(ex){
                slotUpdateTaskCallback(ex, "Update Slot State Failed");
            }
        });

    }

    if(newUserId){
        slotUpdateTask.push(function (slotUpdateTaskCallback) {
            try {
                User.findOne({_id: newUserId, company: company, tenant: tenant}, function (err, newUser) {
                    if (err) {
                        console.log("Get preUser Failed");
                        slotUpdateTaskCallback(err, "Get preUser Failed");
                    } else {
                        if (newUser && newUser.resourceid) {
                            var preUserData = {RequestType: "TICKET", State: "Connected", Reason: "", OtherInfo: ""};
                            var preUserUrl = util.format("http://%s/DVP/API/%s/ARDS/resource/%s/concurrencyslot/session/%s", config.Services.ardsServiceHost, config.Services.ardsServiceVersion, newUser.resourceid, ticketId);
                            if (config.Services.dynamicPort || validator.isIP(config.Services.ardsServiceHost)) {
                                preUserUrl = util.format("http://%s:%s/DVP/API/%s/ARDS/resource/%s/concurrencyslot/session/%s", config.Services.ardsServiceHost, config.Services.ardsServicePort, config.Services.ardsServiceVersion, newUser.resourceid, ticketId);
                            }
                            restClientHandler.DoPut(internalAccessToken, preUserUrl, preUserData, function (err, res1, result) {
                                if (err) {
                                    console.log(err);
                                    slotUpdateTaskCallback(err, "Update Slot State Failed");
                                }
                                else {
                                    console.log("Update newUser Success");
                                    slotUpdateTaskCallback(undefined, "Update newUser Success");
                                }
                            });
                        } else {
                            console.log("newUser Not match with resource");
                            slotUpdateTaskCallback(undefined, "newUser Not match with resource");
                        }
                    }
                });
            }catch(ex){
                slotUpdateTaskCallback(ex, "Update Slot State Failed");
            }
        });

    }

    async.parallel(slotUpdateTask, function (err, result) {
        callback(err, result);
    });
}

function ArdsCallback(req, res){
    var jsonString;
    if (req.body && req.body.ResourceInfo) {
        var ardsResponse = req.body;
        User.findOne({resourceid: ardsResponse.ResourceInfo.ResourceId, company: ardsResponse.Company, tenant: ardsResponse.Tenant}, function (err, user) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.writeHead(503, {'Content-Type': 'application/json; charset=utf-8'});
                res.end(jsonString);
            } else {
                if (user) {
                    Ticket.findOne({company: ardsResponse.Company, tenant: ardsResponse.Tenant, _id: ardsResponse.SessionID}, function (err, ticket) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                            res.writeHead(503, {'Content-Type': 'application/json; charset=utf-8'});
                            res.end(jsonString);
                        }
                        else {
                            if (ticket) {

                                var oldTicket = deepcopy(ticket.toJSON());
                                var time = Date.now();
                                ticket.updated_at = time;
                                var tEvent = TicketEvent({
                                    type: 'status',
                                    body: {
                                        "message" :  "ARDS Ticket Assign To "+user.id,
                                        "time" : time
                                    }
                                });
                                ticket.events.push(tEvent);

                                ticket.assignee_group = undefined;
                                ticket.assignee = user.id ;

                                ticket.update(ticket, function (err, obj) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                                        res.writeHead(503, {'Content-Type': 'application/json; charset=utf-8'});
                                        res.end(jsonString);
                                    }
                                    if(obj){
                                        jsonString = messageFormatter.FormatMessage(undefined, "Ticket Assign To User.", true, undefined);
                                        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
                                        res.end(jsonString);
                                        RemoveRequest(ardsResponse.Tenant, ardsResponse.Company,ardsResponse.SessionID, "NONE", function(){

                                        });
                                        TriggerWorker.ExecuteTrigger(ticket.id, "change_assignee", oldTicket.assignee);
                                    }
                                    else{
                                        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket Information.", false, undefined);
                                        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
                                        res.end(jsonString);
                                        RejectRequest(ardsResponse.Tenant, ardsResponse.Company,ardsResponse.SessionID, "NoSession", function(){

                                        });
                                    }
                                });

                            } else {
                                jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Ticket", false, undefined);
                                res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
                                res.end(jsonString);
                                RejectRequest(ardsResponse.Tenant, ardsResponse.Company,ardsResponse.SessionID, "NoSession", function(){

                                });
                            }
                        }
                    });
                }
                else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Unable To Find User.", false, undefined);
                    res.writeHead(503, {'Content-Type': 'application/json; charset=utf-8'});
                    res.end(jsonString);
                }
            }
        });
    }
    else {
        jsonString = messageFormatter.FormatMessage(undefined, "Invalid User Info.", false, undefined);
        res.writeHead(503, {'Content-Type': 'application/json; charset=utf-8'});
        res.end(jsonString);
    }
}

module.exports.RegisterWithArds = RegisterWithArds;
module.exports.AddRequest = AddRequest;
module.exports.ArdsCallback = ArdsCallback;
module.exports.UpdateSlotState = UpdateSlotState;