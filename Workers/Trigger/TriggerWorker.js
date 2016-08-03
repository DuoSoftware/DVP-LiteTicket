/**
 * Created by Heshan.i on 7/22/2016.
 */

var User = require('dvp-mongomodels/model/User');
var UserGroup = require('dvp-mongomodels/model/UserGroup').UserGroup;
var Trigger = require('dvp-mongomodels/model/TicketTrigers').Trigger;
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var EventEmitter = require('events').EventEmitter;
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var util = require('util');
var PickAgent = require('./PickAgent.js');
var DvpNotification = require('./DvpNotification.js');
var restClientHandler = require('./RestClient.js');
var SlaWorker = require('../SLA/SLAWorker.js');
var redisHandler = require('../Trigger/RedisHandler.js');

function numSort(a, b) {
    return a.priority - b.priority;
}

function UniqueObjectArray(array, field) {
    var processed = [];
    for (var i=array.length-1; i>=0; i--) {
        if (processed.indexOf(array[i][field])<0) {
            processed.push(array[i][field]);
        } else {
            array.splice(i, 1);
        }
    }
    return array;
}

function GenerateFilterRegex(value){
    if(value){
        var regexStr = "";
        var tagArray = value.split(".");
        if(tagArray.length > 0){
            if(tagArray[i] === "*"){
                regexStr = util.format("^%s", "([A-Z]*[a-z]*)*");
            }else{
                regexStr = util.format("^(%s)", tagArray[0]);
            }
        }

        for (var i = 1; i < tagArray.length; i++) {
            if(tagArray[i] === "*"){
                regexStr = util.format("%s[.]%s", regexStr, "([A-Z]*[a-z]*)*");
            }else{
                regexStr = util.format("%s[.](%s)", regexStr, tagArray[i]);
            }
        }
        return util.format("%s[^\s]*", regexStr);
    }else{
        return value;
    }
}

function UpdateDashboardChangeStatus(data, tResult){
    var assignee = tResult.assignee? tResult.assignee: "";
    var assignee_group = tResult.assignee_group? tResult.assignee_group: "";
    data = data? data:"";

    var param1 = util.format("via_%s.tags_%s.user_%s.ugroup_%s", tResult.channel, tResult.tags.join("-"), assignee, assignee_group);
    //var param2 = util.format("user_%s#ugroup_%s", assignee, assignee_group);
    if(data && tResult.status != "new"){
        var pubMessage1 = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End"+data, param1, "param2", tResult.id);
        redisHandler.Publish("events", pubMessage1, function () {
        });
    }
    var pubMessage2 = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, param1, "param2", tResult.id);
    redisHandler.Publish("events", pubMessage2, function () {
    });
}

function UpdateDashboardChangeAssignee(data, tResult){
    var assignee = tResult.assignee? tResult.assignee: "";
    var assignee_group = tResult.assignee_group? tResult.assignee_group: "";
    data = data? data:"";

    var param1 = util.format("via_%s.tags_%s.user_%s.ugroup_%s", tResult.channel, tResult.tags.join("-"), data, assignee_group);
    //var param2 = util.format("user_%s#ugroup_%s");

    var pubMessage1 = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End"+tResult.status, param1, "param2", tResult.id);
    redisHandler.Publish("events", pubMessage1, function () {
    });

    var param1Temp = util.format("via_%s.tags_%s.user_%s.ugroup_%s", tResult.channel, tResult.tags.join("-"), assignee, assignee_group);
    var pubMessage2 = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, param1Temp, "param2", tResult.id);
    redisHandler.Publish("events", pubMessage2, function () {
    });
}

function UpdateDashboardChangeAssigneeGroup(data, tResult){
    var assignee = tResult.assignee? tResult.assignee: "";
    var assignee_group = tResult.assignee_group? tResult.assignee_group: "";
    data = data? data:"";

    var param1 = util.format("via_%s.tags_%s.user_%s.ugroup_%s", tResult.channel, tResult.tags.join("-"), assignee, data);
    //var param2 = util.format("user_%s#ugroup_%s", assignee, data);

    var pubMessage1 = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", "End"+tResult.status, param1, "param2", tResult.id);
    redisHandler.Publish("events", pubMessage1, function () {
    });

    var param1Temp = util.format("via_%s.tags_%s.user_%s.ugroup_%s", tResult.channel, tResult.tags.join("-"), assignee, assignee_group);
    var pubMessage2 = util.format("EVENT:%d:%d:%s:%s:%s:%s:%s:%s:YYYY", tResult.tenant, tResult.company, "TICKET", "STATUS", tResult.status, param1Temp, "param2", tResult.id);
    redisHandler.Publish("events", pubMessage2, function () {
    });
}

function ExecuteOperations(ticketData, operationToExecute){
    //TODO : Replace switch with npm architect
    console.log("operationToExecute:: "+operationToExecute.name);
    switch(operationToExecute.name){
        case "AddInteraction":
            break;
        case "SendMessage":
            break;
        case "PickAgent":
            var attributeIds = operationToExecute.value;
            PickAgent.AddRequest(ticketData.tenant, ticketData.company, ticketData.id, attributeIds, "1", "", function(){});
            break;
        case "SendEmail":
            break;
        case "SendNotification":
            DvpNotification.SendNotification(ticketData, operationToExecute.field, operationToExecute.value);
            break;
        case "InvokeService":
            var internalAccessToken = util.format("%d:%d", ticketData.tenant, ticketData.company);
            var reqUrl = operationToExecute.field;
            var reqData = operationToExecute.value.data;
            var reqMethod = operationToExecute.value.method;
            switch (reqMethod){
                case "POST":
                    restClientHandler.DoPost(internalAccessToken, reqUrl, reqData, function(){});
                    break;
                case "PUT":
                    restClientHandler.DoPut(internalAccessToken, reqUrl, reqData, function(){});
                    break;
                case "GET":
                    restClientHandler.DoGet(internalAccessToken, reqUrl, function(){});
                    break;
                case "DELETE":
                    restClientHandler.DoDelete(internalAccessToken, reqUrl, function(){});
                    break;
                default :
                    break;
            }
            break;
        default :
            break;
    }
}

function ValidateUser(obj, trigger, newAssignee, callback){
    try {
        User.findOne({_id: newAssignee}, function (err, uResult) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                console.log(jsonString);
            } else {
                if (uResult && uResult.company === trigger.company && uResult.tenant === trigger.tenant) {
                    obj.assignee = uResult._id;
                } else {
                    jsonString = messageFormatter.FormatMessage(err, "No User found", false, undefined);
                    console.log(jsonString);
                }
            }
            callback(obj);
        });
    }catch(ex){
        console.log(ex);
        callback(obj);
    }
}

function ValidateGroup(obj, trigger, newGroup, callback){
    try {
        UserGroup.findOne({_id: newGroup}, function (err, ugResult) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get UserGroup Failed", false, undefined);
                console.log(jsonString);
            } else {
                if (ugResult && ugResult.company === trigger.company && ugResult.tenant === trigger.tenant) {
                    obj.assignee_group = ugResult._id;
                } else {
                    jsonString = messageFormatter.FormatMessage(err, "No UserGroup found", false, undefined);
                    console.log(jsonString);
                }
            }
            callback(obj);
        });
    }catch(ex){
        console.log(ex);
        callback(obj);
    }
}

function ValidateAssigneeAndGroup(obj, trigger, newAssignee, newGroup){
    var e = new EventEmitter();
    process.nextTick(function () {
        if(newAssignee != "" && newGroup != ""){
            ValidateGroup(obj, trigger, newGroup, function(rugObj){
                ValidateUser(rugObj, trigger, newAssignee, function(ruObj){
                    e.emit('validateUserAndGroupDone', ruObj);
                });
            });
        }else if(newAssignee != ""){
            ValidateUser(obj, trigger, newAssignee, function(ruObj){
                e.emit('validateUserAndGroupDone', ruObj);
            });
        }else if(newGroup != ""){
            ValidateGroup(obj, trigger, newGroup, function(rugObj){
                e.emit('validateUserAndGroupDone', rugObj);
            });
        }else{
            e.emit('validateUserAndGroupDone', obj);
        }
    });

    return (e);
}

function AggregateCondition(obj, field, value, operator, callback){
    try {
        switch (operator) {
            case "is":
                callback(obj[field] === value);
                break;
            case "less_than":
                callback(obj[field] < value);
                break;
            case "greater_than":
                callback(obj[field] > value);
                break;
            case "is_not":
                callback(obj[field] != value);
                break;
            case "included":
                if(field === "tags") {
                    var pattern_i = new RegExp(GenerateFilterRegex(value));
                    callback(pattern_i.test(obj[field]));
                }else {
                    callback(obj[field].indexOf(value) > -1);
                }
                break;
            case "not_included":
                if(field === "tags") {
                    var pattern_ni = new RegExp(GenerateFilterRegex(value));
                    callback(!pattern_ni.test(obj[field]));
                }else {
                    callback(obj[field].indexOf(value) === -1);
                }
                break;
            case "greater_than_or_equal":
                callback(obj[field] >= value);
                break;
            case "less_than_or_equal":
                callback(obj[field] <= value);
                break;
            default :
                callback(false);
                break;
        }
    }catch(ex){
        callback(false);
    }
}

function ExecuteAndOperation(obj, trigger, callback){
    if(trigger.conditions.all && trigger.conditions.all.length>0){
        var eCount = 0;
        var isDone = false;
        for(var i = 0; i < trigger.conditions.all.length; i++){
            var condition = trigger.conditions.all[i];
            AggregateCondition(obj, condition.field, condition.value, condition.operator, function(aResult){
                eCount++;
                if(!isDone && aResult === false){
                    callback(true, false, trigger);
                    isDone = true;
                    //break;
                }
                if(!isDone && eCount === trigger.conditions.all.length){
                    callback(true, true, trigger);
                }
            });
        }
    }else{
        callback(false, false, trigger);
    }
}

function ExecuteOrOperation(obj, trigger, callback){
    if(trigger.conditions.any && trigger.conditions.any.length>0){
        var eCount = 0;
        var isDone = false;
        for(var i = 0; i < trigger.conditions.any.length; i++){
            var condition = trigger.conditions.any[i];
            AggregateCondition(obj, condition.field, condition.value, condition.operator, function(aResult){
                eCount++;
                if(!isDone && aResult === true){
                    callback(true, true, trigger);
                    isDone = true;
                    //break;
                }
                if(!isDone && eCount === trigger.conditions.any.length){
                    callback(true, false, trigger);
                }
            });
        }
    }else{
        callback(false, false, trigger);
    }
}

function MatchTriggers(obj, triggers){
    var e = new EventEmitter();
    process.nextTick(function () {
        if (triggers && triggers.length>0) {
            var allCount = 0;
            var anyCount = 0;
            for (var i = 0; i < triggers.length; i++) {
                var trigger = triggers[i];
                ExecuteAndOperation(obj, trigger, function(accept, match, rTrigger){
                    allCount++;
                    if(accept && match) {
                        e.emit('trigger', rTrigger);
                    }
                    if (triggers.length === allCount && triggers.length === anyCount) {
                        e.emit('endMatchingTriggers');
                    }
                });
                ExecuteOrOperation(obj, trigger, function(accept, match, rTrigger){
                    anyCount++;
                    if(accept && match) {
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

function ExecuteTrigger(ticketId, triggerEvent, data, callback){
    var jsonString;

    if(ticketId) {
        Ticket.findOne({_id: ticketId}, function (err, tResult) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get Ticket Failed", false, undefined);
                callback(jsonString);
            } else {
                if (tResult) {
                    if(triggerEvent === "change_assignee"){
                        PickAgent.UpdateSlotState(tResult.company, tResult.tenant, data, tResult.assignee, tResult.id);
                        UpdateDashboardChangeAssignee(data, tResult);
                    }else if(triggerEvent === "change_status"){
                        SlaWorker.UpdateSLAWhenStateChange(tResult);
                        UpdateDashboardChangeStatus(data, tResult);
                    }else if(triggerEvent === "change_assignee_groups"){
                        UpdateDashboardChangeAssigneeGroup(data, tResult);
                    }
                    Trigger.find({$and:[{company:tResult.company}, {tenant:tResult.tenant}, {triggerEvent: triggerEvent}, {Active: true}]}, function (err, trResult) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Find Trigger Failed", false, undefined);
                            callback(jsonString);
                        } else {
                            if (trResult) {
                                var matchingTriggers = [];
                                var mt = MatchTriggers(tResult, trResult);

                                mt.on('trigger', function (trigger) {
                                    matchingTriggers.push(trigger);
                                });

                                mt.on('endMatchingTriggers', function () {
                                    var triggersToExecute = UniqueObjectArray(matchingTriggers, "title").sort(numSort);
                                    if(triggersToExecute.length > 0){
                                        var triggerToExecute = triggersToExecute[0];
                                        if(triggerToExecute.actions.length > 0) {
                                            var newAssignee = "";
                                            var newAssignee_group = "";
                                            for (var i = 0; i < triggerToExecute.actions.length; i++) {
                                                var action = triggerToExecute.actions[i];

                                                switch (action.field){
                                                    case "assignee":
                                                        newAssignee = action.value;
                                                        break;
                                                    case "assignee_group":
                                                        newAssignee_group = action.value;
                                                        break;
                                                    default :
                                                        tResult[action.field] = action.value;
                                                        break;
                                                }
                                            }

                                            var vag = ValidateAssigneeAndGroup(tResult, triggerToExecute, newAssignee, newAssignee_group);
                                            vag.on('validateUserAndGroupDone', function(updatedTicket){
                                                Ticket.findOneAndUpdate({_id: ticketId}, updatedTicket, function(err, utResult){
                                                    if(err){
                                                        console.log("Update ticket Failed: "+ err);
                                                        jsonString = messageFormatter.FormatMessage(err, "Update Ticket Failed", false, undefined);
                                                        callback(jsonString);
                                                    }else{
                                                        console.log("Update ticket Success: "+ utResult);
                                                        jsonString = messageFormatter.FormatMessage(err, "Update Ticket Fields Success", true, undefined);
                                                        callback(jsonString);
                                                    }
                                                });
                                            });
                                        }

                                        if(triggerToExecute.operations.length > 0){
                                            for(var j = 0; j < triggerToExecute.operations.length; j++){
                                                var operationToExecute = triggerToExecute.operations[j];
                                                ExecuteOperations(tResult, operationToExecute);
                                            }
                                        }
                                    }else{
                                        jsonString = messageFormatter.FormatMessage(undefined, "No active trigger found", false, undefined);
                                        callback(jsonString);
                                    }
                                });
                            } else {
                                jsonString = messageFormatter.FormatMessage(undefined, "ExecuteTrigger Failed, Trigger object is null", false, undefined);
                                callback(jsonString);
                            }
                        }
                    });
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "ExecuteTrigger Failed, package object is null", false, undefined);
                    callback(jsonString);
                }
            }
        });
    }else{
        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID", false, undefined);
        callback(jsonString);
    }
}



module.exports.ExecuteTrigger = ExecuteTrigger;
module.exports.ExecuteOperations = ExecuteOperations;