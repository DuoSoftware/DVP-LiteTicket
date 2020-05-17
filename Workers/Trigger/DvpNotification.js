/**
 * Created by Heshan.i on 7/20/2016.
 */
var User = require('dvp-mongomodels/model/User');
var UserGroup = require('dvp-mongomodels/model/UserGroup').UserGroup;
var validator = require('validator');
var config = require('config');
var restClientHandler = require('./RestClient.js');
var util = require('util');
var dust = require('dustjs-linkedin');
var uuid =require('node-uuid');


function InitiateNotification(internalAccessToken, notificationData){
    var initUrl = util.format("http://%s/DVP/API/%s/NotificationService/Notification/initiate", config.Services.notificationServiceHost, config.Services.notificationServiceVersion);
    if (config.Services.dynamicPort || validator.isIP(config.Services.notificationServiceHost)) {
        initUrl = util.format("http://%s:%s/DVP/API/%s/NotificationService/Notification/initiate", config.Services.notificationServiceHost, config.Services.notificationServicePort, config.Services.notificationServiceVersion);
    }
    restClientHandler.DoPostNotification(internalAccessToken, initUrl, notificationData, function (err, res1, result) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("Send InitiateNotification Success");
        }
    });
}


function InitiateTicketNotification(internalAccessToken, notificationData){
    var initUrl = util.format("http://%s/DVP/API/%s/NotificationService/Notification/initiate", config.Services.notificationServiceHost, config.Services.notificationServiceVersion);
    if (config.Services.dynamicPort || validator.isIP(config.Services.notificationServiceHost)) {
        initUrl = util.format("http://%s:%s/DVP/API/%s/NotificationService/Notification/initiate", config.Services.notificationServiceHost, config.Services.notificationServicePort, config.Services.notificationServiceVersion);
    }
    restClientHandler.DoPostTicketNotification(internalAccessToken, initUrl, notificationData, function (err, res1, result) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("Send InitiateNotification Success");
        }
    });
}


function BroadcastNotification(internalAccessToken, notificationData){
    var initUrl = util.format("http://%s/DVP/API/%s/NotificationService/Notification/Broadcast", config.Services.notificationServiceHost, config.Services.notificationServiceVersion);
    if (config.Services.dynamicPort || validator.isIP(config.Services.notificationServiceHost)) {
        initUrl = util.format("http://%s:%s/DVP/API/%s/NotificationService/Notification/Broadcast", config.Services.notificationServiceHost, config.Services.notificationServicePort, config.Services.notificationServiceVersion);
    }
    restClientHandler.DoPostNotification(internalAccessToken, initUrl, notificationData, function (err, res1, result) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("Send BroadcastNotification Success");
        }
    });
}

function SendNotificationToAssignee(company, tenant, internalAccessToken, userId, message){
    User.findOne({_id: userId, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            console.log("Get User Failed");
        } else {
            if(user) {
                var nData = {
                    From: "",
                    To: user.username,
                    Message: message,
                    Direction: "STATELESS",
                    CallbackURL: "",
                    Ref: ""
                };
                InitiateNotification(internalAccessToken, nData);
            }else{
                console.log("User Data empty");
            }
        }
    });

}

function SendNotificationToAssigneeGroup(company, tenant, internalAccessToken, groupId, message){
    UserGroup.findOne({_id: groupId, company: company, tenant: tenant}, function (err, userGroup) {
        if (err) {
            console.log("Get UserGroup Failed");
        } else {
            if(userGroup) {
                var nData = {
                    Message: message
                };


                User.find({company: company, tenant: tenant, group: groupId},function (err, users) {

                    if(Array.isArray(users) && users.length >0) {

                        var users =  users.map(function(item){
                            return  item.username
                        });
                        nData.clients = users;
                        BroadcastNotification(internalAccessToken,nData);

                    }else{
                        console.log("UserGroup Data empty");
                    }

                });

                /*

                if(userGroup.users && userGroup.users.length >0) {
                    var count = 0;
                    var clientList = [];
                    for (var i = 0; i < userGroup.users.length; i++) {
                        var userId = userGroup.users[i];
                        User.findOne({_id: userId, company: company, tenant: tenant}, function (err, user) {
                            count++;
                            if (err) {
                                console.log("Get User Failed");
                            } else {
                                var client = {name: user.username};
                                clientList.push(client);
                            }

                            if(count === userGroup.users.length){
                                nData.Clients = clientList;
                                BroadcastNotification(internalAccessToken, nData);
                            }
                        });
                    }
                }

                */
            }else{
                console.log("UserGroup Data empty");
            }
        }
    });

}

function SendNotificationToCollaborators(company, tenant, internalAccessToken, collaboratorList, message){
    var nData = {
        Message: message
    };
    if(collaboratorList && collaboratorList.length > 0) {
        var count = 0;
        var clientList = [];
        for (var i = 0; i < collaboratorList.length; i++) {
            var userId = collaboratorList[i];
            User.findOne({_id: userId, company: company, tenant: tenant}, function (err, user) {
                count++;
                if (err) {
                    console.log("Get User Failed");
                } else {
                    if(user) {
                        clientList.push(user.username);
                    }
                }
                if(count === collaboratorList.length){
                    if(clientList.length > 0) {
                        nData.Clients = clientList;
                        BroadcastNotification(internalAccessToken, nData);
                    }
                }
            });
        }
    }
}


function SendNotification(ticket, field, value){
    try{
        var internalAccessToken = util.format("%d:%d", ticket.tenant, ticket.company);
        var msg = value;

        var compileid = uuid.v4();
        var compiled = dust.compile(value, compileid);
        dust.loadSource(compiled);
        dust.render(compileid, ticket, function(errRendered, outRendered) {
            if (errRendered) {
                logger.error("Error in rendering " + errRendered);
            }
            else {
                msg = outRendered;
            }

            switch (field){
                case "assignee":
                    SendNotificationToAssignee(ticket.company, ticket.tenant, internalAccessToken, ticket.assignee, msg);
                    break;
                case "assignee_group":
                    SendNotificationToAssigneeGroup(ticket.company, ticket.tenant, internalAccessToken, ticket.assignee_group, msg);
                    break;
                case "collaborators":
                    SendNotificationToCollaborators(ticket.company, ticket.tenant, internalAccessToken, ticket.collaborators, msg);
                    break;
                default :
                    break;
            }
        });

    }catch(ex){
        console.log("Send Notification failed::", ex);
    }
}


function SendTicketNotification(ticket, action, from){
    try{
        var internalAccessToken = util.format("%d:%d", ticket.tenant, ticket.company);
        var room = util.format("%s:%s:subscribe:ticket:%s", ticket.tenant, ticket.company, ticket.reference);
        var nData = {
            From: from,
            To: room,
            Message: {
                action: action,
                reference: ticket.reference,
                assignee:ticket.assignee
            },
            Direction: "STATELESS",
            CallbackURL: "",
            Ref: ""
        };

        if(ticket.status){

            nData.Message.status = ticket.status;
        }

        InitiateTicketNotification(internalAccessToken, nData);


    }catch(ex){
        console.log("Send Notification failed::", ex);
    }
}


module.exports.SendNotification = SendNotification;
module.exports.SendTicketNotification = SendTicketNotification;