/**
 * Created by Heshan.i on 11/7/2016.
 */

var validator = require('validator');
var config = require('config');
var restClientHandler = require('../Trigger/RestClient.js');
var util = require('util');
var uuid = require('node-uuid');

function AddEngagementSession(company, tenant, sessionId, channelFrom, channelTo, direction, requesterId, callback){
    var internalAccessToken = util.format("%d:%d", tenant, company);

    var engSessionObj = {
        engagement_id: sessionId,
        channel: "api",
        channel_from: channelFrom,
        channel_to: channelTo,
        direction: direction,
        has_profile: requesterId? true: false
    };

    var initUrl = util.format("http://%s/DVP/API/%s/Engagement/%s/EngagementSession", config.Services.interactionServiceHost, config.Services.interactionServiceVersion, requesterId);
    if (config.Services.dynamicPort || validator.isIP(config.Services.interactionServiceHost)) {
        initUrl = util.format("http://%s:%s/DVP/API/%s/Engagement/%s/EngagementSession", config.Services.interactionServiceHost, config.Services.interactionServicePort, config.Services.interactionServiceVersion, requesterId);
    }
    restClientHandler.DoPost(internalAccessToken, initUrl, engSessionObj, function (err, res1, result) {
        if (err) {
            console.log(err);
            callback(false);
        }
        else {
            console.log("Add Engagement session Success:: ", result);
            var jResult = JSON.parse(result);
            if(jResult.IsSuccess) {
                callback(true);
            }else{
                callback(false);
            }
        }
    });
}


function AppendNoteToEngagement(company, tenant, sessionId, note){
    var internalAccessToken = util.format("%d:%d", tenant, company);

    var noteObj = {
        body: note
    };

    var initUrl = util.format("http://%s/DVP/API/%s/EngagementSession/%s/Note", config.Services.interactionServiceHost, config.Services.interactionServiceVersion, sessionId);
    if (config.Services.dynamicPort || validator.isIP(config.Services.interactionServiceHost)) {
        initUrl = util.format("http://%s:%s/DVP/API/%s/EngagementSession/%s/Note", config.Services.interactionServiceHost, config.Services.interactionServicePort, config.Services.interactionServiceVersion, sessionId);
    }
    restClientHandler.DoPost(internalAccessToken, initUrl, noteObj, function (err, res1, result) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("Append Note To Engagement Success:: ", result);
        }
    });
}


function AddInteraction(ticket, note){
    if(ticket) {
        var engSessionId = uuid.v1().toString();
        var requesterId = ticket.requester ? ticket.requester._id : undefined;
        AddEngagementSession(ticket.company, ticket.tenant, engSessionId, 'trigger', 'direct', 'direct', requesterId, function (response) {
            if (response === true && note) {
                AppendNoteToEngagement(ticket.company, ticket.tenant, engSessionId, note);
            }
        });
    }else{
        console.log('Undefined ticket data')
    }
}


module.exports.AddInteraction = AddInteraction;