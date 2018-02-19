/**
 * Created by dinusha on 8/28/2017.
 */
var EngagementSession = require('dvp-mongomodels/model/Engagement').EngagementSession;
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var fs = require('fs');
var moment = require('moment');
var externalApi = require('./ExternalApiAccess.js');
var redisClient = require('./RedisHandler.js').redisClient;
var async = require('async');
var json2csv = require('json2csv');

var appendToCSVFile = function(uniqueId, fileName, tempQuery, offset, limit, tz, callback)
{
    var newLine= "\r\n";
    var smsListForCSV = [];


    var tagHeaders = ['From', 'To', 'Direction', 'SMS Date', 'Delivery Status', 'Message'];
    var tagOrder = ['channel_from', 'channel_to', 'direction', 'created_at', 'delivery_status', 'body'];


    EngagementSession.find(tempQuery)
        .sort({created_at: 'desc'})
        .skip(offset)
        .limit(limit)
        .maxTime(300000)
        .lean()
        .exec(function (err, smsList)
        {
            if (err)
            {
                smsList = null;
                global.gc();
                callback(err, false);
            }
            else
            {
                if(smsList && smsList.length > 0)
                {
                    var decodeTz = decodeURIComponent(tz);
                    smsList.forEach(function (smsInfo) {
                        var smsInfoTemp =
                        {
                            channel_from: smsInfo.channel_from,
                            channel_to: smsInfo.channel_to,
                            direction: smsInfo.direction,
                            body: smsInfo.body,
                            delivery_status: smsInfo.delivery_status,
                            created_at: moment(smsInfo.created_at).utcOffset(decodeTz).format("YYYY-MM-DD HH:mm:ss")

                        };

                        smsListForCSV.push(smsInfoTemp);

                    });

                    fs.stat(fileName, function (err)
                    {
                        if (err == null)
                        {
                            //write the actual data and end with newline
                            var csv = json2csv({ data: smsListForCSV, fields: tagOrder, hasCSVColumnTitle: false }) + newLine;

                            fs.appendFile(fileName, csv, function (err) {
                                if (err)
                                {
                                    smsListForCSV = null;
                                    smsList = null;
                                    global.gc();
                                    callback(err, false);

                                }
                                else
                                {
                                    smsListForCSV = null;
                                    smsList = null;
                                    global.gc();
                                    callback(null, true);
                                }

                            });
                        }
                        else
                        {
                            var headerFields = tagHeaders + newLine;

                            fs.writeFile(fileName, headerFields, function (err, stat)
                            {
                                if (err)
                                {
                                    smsListForCSV = null;
                                    smsList = null;
                                    global.gc();
                                    callback(err, false);
                                }
                                else
                                {
                                    var csv = json2csv({ data: smsListForCSV, fields: tagOrder, hasCSVColumnTitle: false }) + newLine;

                                    fs.appendFile(fileName, csv, function (err) {
                                        if (err)
                                        {
                                            smsListForCSV = null;
                                            smsList = null;
                                            global.gc();
                                            callback(err, false);

                                        }
                                        else
                                        {
                                            smsListForCSV = null;
                                            smsList = null;
                                            global.gc();
                                            callback(null, true);
                                        }

                                    });
                                }
                            });
                        }
                    });
                }
                else
                {
                    smsList = null;
                    global.gc();
                    callback(null, true);
                }



            }

        });

};

module.exports.GetSMSDetailReportDownload = function(req, res){


    logger.info("DVP-LiteTicket.GetSMSDetailReportDownload Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    if(req.query && req.query['from']&& req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];


        try {
            from = new Date(from);
            to = new Date(to);
        }catch(ex){
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are require", false, undefined);
            res.end(jsonString);
            return;
        }

        if(from > to){

            jsonString = messageFormatter.FormatMessage(undefined, "From should less than To", false, undefined);
            res.end(jsonString);
            return;

        }

        var tempQuery = {company: company, tenant: tenant};

        tempQuery['created_at'] = { $gte: from, $lte: to };

        var fromDate = moment(from).format("YYYY-MM-DD");
        var toDate = moment(to).format("YYYY-MM-DD");

        var fileName = 'SMS_' + fromDate + '_' + toDate;

        fileName = fileName.replace(/:/g, "-") + '.csv';

        var tz = '';

        if(req.body)
        {

            tz = req.body.tz;

            if(req.body.channel_to){
                tempQuery.channel_to = req.body.channel_to;
            }

            if(req.body.channel_from){
                tempQuery.channel_from = req.body.channel_from;
            }

            if(req.body.status){
                tempQuery.status = req.body.status;
            }

            if(req.body.direction)
            {
                tempQuery.direction = req.body.direction;
            }

            tempQuery.channel = 'sms';
        }

        var fileCheckKey = 'SMSFILE:' + fromDate + ':' + toDate;

        redisClient.getset(fileCheckKey, true, function(err, redisResp)
        {
            if(redisResp)
            {
                jsonString = messageFormatter.FormatMessage(new Error('Another user generating same file, please try again'), "ERROR", false, null);
                logger.debug('[DVP-LiteTicket.GetSMSDetailReportDownload] - API RESPONSE : %s', jsonString);
                res.end(jsonString);
            }
            else
            {
                externalApi.RemoteGetFileMetadata(null, fileName, company, tenant, function(err, fileData)
                {
                    if(err)
                    {
                        redisClient.del(fileCheckKey);
                        jsonString = messageFormatter.FormatMessage(err, "error getting file metadata", false, null);
                        res.end(jsonString);
                    }
                    else
                    {
                        if(fileData)
                        {
                            //delete file
                            externalApi.DeleteFile(null, fileData.UniqueId, company, tenant, function(err, delResp)
                            {
                                if(err)
                                {
                                    redisClient.del(fileCheckKey);
                                    jsonString = messageFormatter.FormatMessage(err, "error deleting file", false, null);
                                    res.end(jsonString);
                                }
                                else
                                {
                                    externalApi.FileUploadReserve(null, fileName, company, tenant, function(err, fileResResp)
                                    {
                                        if(err || !fileResResp)
                                        {
                                            redisClient.del(fileCheckKey);
                                            jsonString = messageFormatter.FormatMessage(err, "error reserving file", false, null);
                                            res.end(jsonString);
                                        }
                                        else
                                        {
                                            var uniqueId = fileResResp;

                                            jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, fileName);
                                            res.end(jsonString);

                                            var offset = 0;
                                            var limit = 5000;

                                            EngagementSession.count(tempQuery, function (err, smsCnt)
                                            {
                                                if(!err && smsCnt)
                                                {
                                                    var arr = [];
                                                    while(smsCnt > offset)
                                                    {
                                                        arr.push(appendToCSVFile.bind(this, uniqueId, fileName, tempQuery, offset, limit, tz));
                                                        offset = offset + limit;

                                                    }

                                                    async.series(arr, function(err, results)
                                                    {
                                                        if(err)
                                                        {
                                                            redisClient.del(fileCheckKey);
                                                            externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){

                                                            });
                                                        }
                                                        else
                                                        {
                                                            externalApi.UploadFile(null, uniqueId, fileName, company, tenant, function(err, uploadResp)
                                                            {
                                                                redisClient.del(fileCheckKey);
                                                                fs.unlink(fileName);
                                                                if(!err && uploadResp)
                                                                {

                                                                }
                                                                else
                                                                {
                                                                    externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){
                                                                        if(err)
                                                                        {
                                                                            logger.error('[DVP-LiteTicket.GetSMSDetailReportDownload] - [%s] - Delete Failed : %s', null, err);
                                                                        }
                                                                    });
                                                                }

                                                            });
                                                        }

                                                    })


                                                }
                                                else
                                                {
                                                    redisClient.del(fileCheckKey);
                                                    externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){

                                                    });

                                                }
                                            });





                                        }

                                    });
                                }
                            })
                        }
                        else
                        {
                            externalApi.FileUploadReserve(null, fileName, company, tenant, function(err, fileResResp)
                            {
                                if(err || !fileResResp)
                                {
                                    redisClient.del(fileCheckKey);
                                    jsonString = messageFormatter.FormatMessage(err, "error reserving file", false, null);
                                    res.end(jsonString);
                                }
                                else
                                {
                                    var uniqueId = fileResResp;

                                    jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, fileName);
                                    res.end(jsonString);

                                    var offset = 0;
                                    var limit = 5000;

                                    EngagementSession.count(tempQuery, function (err, smsCnt)
                                    {
                                        if(!err && smsCnt)
                                        {
                                            var arr = [];
                                            while(smsCnt > offset)
                                            {
                                                arr.push(appendToCSVFile.bind(this, uniqueId, fileName, tempQuery, offset, limit, tz));
                                                offset = offset + limit;

                                            }

                                            async.series(arr, function(err, results)
                                            {
                                                if(err)
                                                {
                                                    redisClient.del(fileCheckKey);
                                                    externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){

                                                    });
                                                }
                                                else
                                                {
                                                    externalApi.UploadFile(null, uniqueId, fileName, company, tenant, function(err, uploadResp)
                                                    {
                                                        redisClient.del(fileCheckKey);
                                                        fs.unlink(fileName);
                                                        if(!err && uploadResp)
                                                        {

                                                        }
                                                        else
                                                        {
                                                            externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){
                                                                if(err)
                                                                {
                                                                    logger.error('[DVP-LiteTicket.GetTicketDetailReportDownload] - [%s] - Delete Failed : %s', null, err);
                                                                }
                                                            });
                                                        }

                                                    });
                                                }

                                            })


                                        }
                                        else
                                        {
                                            redisClient.del(fileCheckKey);
                                            externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){

                                            });

                                        }
                                    });


                                }

                            });
                        }
                    }

                });
            }

        });



    }
    else
    {

        jsonString = messageFormatter.FormatMessage(new Error('insufficient query parameters'), "insufficient query parameters", false, null);
        res.end(jsonString);
    }




};

module.exports.GetSMSDetailReport = function(req, res)
{
    var emptyList = [];

    logger.info("DVP-LiteTicket.GetSMSDetailReport Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    if(req.query && req.query['from']&& req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];

        try {
            from = new Date(from);
            to = new Date(to);
        }catch(ex){
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are required", false, null);
            res.end(jsonString);
            return;
        }

        if(from > to){

            jsonString = messageFormatter.FormatMessage(new Error('From date should be less than to To Date'), "From date should be less than to To Date", false, null);
            res.end(jsonString);
            return;

        }

        var tempQuery = {company: company, tenant: tenant};

        tempQuery['created_at'] = { $gte: from, $lte: to };

        tempQuery['channel'] = 'sms';

        if(req.body){

            if(req.body.channel_to){
                tempQuery.channel_to = req.body.channel_to;
            }

            if(req.body.channel_from){
                tempQuery.channel_from = req.body.channel_from;
            }

            if(req.body.status){
                tempQuery.status = req.body.status;
            }

            if(req.body.direction)
            {
                tempQuery.direction = req.body.direction;
            }
        }

        var tempLimit = parseInt(req.params.limit);
        var tempSkip = parseInt(req.params.skip);

        EngagementSession.find(tempQuery)
            .sort({created_at: 'desc'})
            .skip(tempSkip)
            .limit(tempLimit)
            .exec(function (err, smsList) {
                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Get All SMS Failed", false, emptyList);
                } else {
                    jsonString = messageFormatter.FormatMessage(null, "Get All SMS Successful", true, smsList);
                }
                res.end(jsonString);
            });

    }
    else
    {
        jsonString = messageFormatter.FormatMessage(new Error('Date range not provided'), "From and To dates are required", false, emptyList);
        res.end(jsonString);
    }

};

module.exports.GetSMSDetailReportCount = function(req, res){

    logger.info("DVP-LiteTicket.GetSMSDetailReportCount Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    if(req.query && req.query['from']&& req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];

        try {
            from = new Date(from);
            to = new Date(to);
        }catch(ex){
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are required", false, 0);
            res.end(jsonString);
            return;
        }

        if(from > to){

            jsonString = messageFormatter.FormatMessage(new Error('From date need to be less than or equal to To date'), "From date need to be less than or equal to To date", false, 0);
            res.end(jsonString);
            return;

        }

        var tempQuery = {company: company, tenant: tenant};

        tempQuery['created_at'] = { $gte: from, $lte: to };

        tempQuery['channel'] = 'sms';

        if(req.body){

            if(req.body.channel_to){
                tempQuery.channel_to = req.body.channel_to;
            }

            if(req.body.channel_from){
                tempQuery.channel_from = req.body.channel_from;
            }

            if(req.body.status){
                tempQuery.status = req.body.status;
            }

            if(req.body.direction)
            {
                tempQuery.direction = req.body.direction;
            }

        }

        EngagementSession.count(tempQuery, function (err, smsCount) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get All SMS Failed", false, 0);
            } else {


                jsonString = messageFormatter.FormatMessage(null, "Get All SMS Successful", true, smsCount);

            }
            res.end(jsonString);
        });

    }else{

        jsonString = messageFormatter.FormatMessage(null, "From and To dates are require", false, 0);
        res.end(jsonString);
    }


};