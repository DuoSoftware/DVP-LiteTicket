var mongoose = require('mongoose');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var Tag = require('dvp-mongomodels/model/Tag').Tag;
var TagCategory = require('dvp-mongomodels/model/Tag').TagCategory;
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var auditTrailsHandler = require('dvp-common/AuditTrail/AuditTrailsHandler.js');


function addAuditTrail(tenantId, companyId, iss, auditData) {
    /*var auditData =  {
     KeyProperty: keyProperty,
     OldValue: auditTrails.OldValue,
     NewValue: auditTrails.NewValue,
     Description: auditTrails.Description,
     Author: auditTrails.Author,
     User: iss,
     OtherData: auditTrails.OtherData,
     ObjectType: auditTrails.ObjectType,
     Action: auditTrails.Action,
     Application: auditTrails.Application,
     TenantId: tenantId,
     CompanyId: companyId
     }*/

    try {
        auditTrailsHandler.CreateAuditTrails(tenantId, companyId, iss, auditData, function (err, obj) {
            if (err) {
                var jsonString = messageFormatter.FormatMessage(err, "Fail", false, auditData);
                logger.error('addAuditTrail -  Fail To Save Audit trail-[%s]', jsonString);
            }
        });
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "Fail", false, auditData);
        logger.error('addAuditTrail -  insertion  failed-[%s]', jsonString);
    }
}

function CreateTagCategory(req, res){

    logger.debug("DVP-LiteTicket.CreateTagCategory Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;
    var jsonString;
    var tagCategory = TagCategory({
        name:req.body.name,
        company:company,
        tenant:tenant,
        description:req.body.description
    });

    tagCategory.save(function (errNewCategory, resNewCategory) {
        if(errNewCategory)
        {
            jsonString=messageFormatter.FormatMessage(errNewCategory, "Tag category creation failed", false, undefined);
        }
        else
        {

            var auditData = {
                KeyProperty: "TagCategory",
                OldValue: {},
                NewValue: resNewCategory,
                Description: "New Tag Category Created.",
                Author: iss,
                User: iss,
                ObjectType: "TagCategory",
                Action: "SAVE",
                Application: "Lite Ticket Service"
            };
            addAuditTrail(tenant, company, iss, auditData);


            jsonString=messageFormatter.FormatMessage(undefined, "Tag category creation succeeded", true, resNewCategory);
        }
        res.end(jsonString);
    });


};
function RemoveTagCategory(req, res){

    logger.debug("DVP-LiteTicket.RemoveTagCategory Internal method ");

    var jsonString;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;

    TagCategory.findOneAndRemove({_id:req.params.id,company:company,tenant:tenant}, function (errRemove,resRemove) {
        if(errRemove)
        {
            jsonString=messageFormatter.FormatMessage(errRemove, "Tag category deletion failed", false, undefined);
        }
        else
        {

            var auditData = {
                KeyProperty: "TagCategory",
                OldValue: {},
                NewValue: resRemove,
                Description: "Tag Category Removed.",
                Author: iss,
                User: iss,
                ObjectType: "TagCategory",
                Action: "DELETE",
                Application: "Lite Ticket Service"
            };
            addAuditTrail(tenant, company, iss, auditData);

            jsonString=messageFormatter.FormatMessage(undefined, "Tag category deletion succeeded", true, resRemove);
        }
        res.end(jsonString);
    });

};
function GetTagCategory(req, res){

    logger.debug("DVP-LiteTicket.GetTagCategory Internal method ");

    var jsonString;
    var tagId=req.params.id;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    TagCategory.findOne({_id:tagId,company:company,tenant:tenant}).populate("tags").exec(function (errPickTagCategory,PickTagCategory) {

        if(errPickTagCategory)
        {
            jsonString=messageFormatter.FormatMessage(errPickTagCategory, "Picking tag category failed", false, undefined);
        }
        else
        {
            jsonString=messageFormatter.FormatMessage(undefined, "Picking tag category succeeded", true, PickTagCategory);
        }
        res.end(jsonString);
    });

};
function GetTagCategories(req, res){

    logger.debug("DVP-LiteTicket.GetTagCategories Internal method ");

    var jsonString;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    TagCategory.find({company:company,tenant:tenant}).populate("tags").exec(function (errAllTagCats,resAllTagCats) {

        if(errAllTagCats)
        {
            jsonString=messageFormatter.FormatMessage(errAllTagCats, "Picking All tag categories failed", false, undefined);
        }
        else
        {
            if(resAllTagCats.length>0)
            {
                jsonString=messageFormatter.FormatMessage(undefined, "Picking All tag categories succeeded", true, resAllTagCats);
            }
            else
            {
                jsonString=messageFormatter.FormatMessage(undefined, "No tag categories found", false, resAllTagCats)
            }

        }
        res.end(jsonString);
    });

};
function GetTagCategoriesWithoutPopulation(req, res){

    logger.debug("DVP-LiteTicket.GetTagCategories Internal method ");

    var jsonString;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    TagCategory.find({company:company,tenant:tenant}).exec(function (errAllTagCats,resAllTagCats) {

        if(errAllTagCats)
        {
            jsonString=messageFormatter.FormatMessage(errAllTagCats, "Picking All tag categories failed", false, undefined);
        }
        else
        {
            if(resAllTagCats.length>0)
            {
                jsonString=messageFormatter.FormatMessage(undefined, "Picking All tag categories succeeded", true, resAllTagCats);
            }
            else
            {
                jsonString=messageFormatter.FormatMessage(undefined, "No tag categories found", false, resAllTagCats)
            }

        }
        res.end(jsonString);
    });

};
function CreateTag(req, res){

    logger.debug("DVP-LiteTicket.CreateTagCategory Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;
    var jsonString;

    var tag = Tag({
        name:req.body.name,
        description:req.body.description,
        company:company,
        tenant:tenant

    });

    tag.save(function (errNewTag, resNewTag) {
        if(errNewTag)
        {
            jsonString=messageFormatter.FormatMessage(errNewTag, "Tag creation failed", false, undefined);
        }
        else
        {
            var auditData = {
                KeyProperty: "Tag",
                OldValue: {},
                NewValue: resNewTag,
                Description: "New Tag Created.",
                Author: iss,
                User: iss,
                ObjectType: "Tag",
                Action: "SAVE",
                Application: "Lite Ticket Service"
            };
            addAuditTrail(tenant, company, iss, auditData);
            jsonString=messageFormatter.FormatMessage(undefined, "Tag creation succeeded", true, resNewTag);
        }
        res.end(jsonString);
    });

};
function GetTags(req, res){

    logger.debug("DVP-LiteTicket.GetTags Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;

    Tag.find({company:company,tenant:tenant}).populate("tags").exec(function (errAllTags,resAllTags) {

        if(errAllTags)
        {
            jsonString=messageFormatter.FormatMessage(errAllTags, "Picking All tags failed", false, undefined);
        }
        else
        {
            if(resAllTags.length>0)
            {
                jsonString=messageFormatter.FormatMessage(undefined, "Picking All tags succeeded", true, resAllTags);
            }
            else
            {
                jsonString=messageFormatter.FormatMessage(undefined, "No tags found", false, resAllTags)
            }

        }
        res.end(jsonString);
    });




};
function GetTagsWithoutPopulation(req, res){

    logger.debug("DVP-LiteTicket.GetTags Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;

    Tag.find({company:company,tenant:tenant}).exec(function (errAllTags,resAllTags) {

        if(errAllTags)
        {
            jsonString=messageFormatter.FormatMessage(errAllTags, "Picking All tags failed", false, undefined);
        }
        else
        {
            if(resAllTags.length>0)
            {
                jsonString=messageFormatter.FormatMessage(undefined, "Picking All tags succeeded", true, resAllTags);
            }
            else
            {
                jsonString=messageFormatter.FormatMessage(undefined, "No tags found", false, resAllTags)
            }

        }
        res.end(jsonString);
    });




};
function GetTag(req, res){

    logger.debug("DVP-LiteTicket.GetTag Internal method ");

    var jsonString;
    var tagId=req.params.id;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    Tag.findOne({_id:tagId,company:company,tenant:tenant}).populate("tags").exec(function (errPickTag,PickTag) {

        if(errPickTag)
        {
            jsonString=messageFormatter.FormatMessage(errPickTag, "Picking tag failed", false, undefined);
        }
        else
        {
            jsonString=messageFormatter.FormatMessage(undefined, "Picking tag succeeded", true, PickTag);
        }
        res.end(jsonString);
    });

};
function DeleteTag(req, res){

    logger.debug("DVP-LiteTicket.DeleteTag Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;
    var jsonString;

    Tag.findOneAndRemove({id:req.params.id,company:company,tenant:tenant}, function (errTagRemove,resTagRemove) {
        if(errTagRemove)
        {
            jsonString=messageFormatter.FormatMessage(errTagRemove, "Tag category deletion failed", false, undefined);
        }
        else
        {
            var auditData = {
                KeyProperty: "Tag",
                OldValue: {},
                NewValue: resTagRemove,
                Description: "Tag Removed.",
                Author: iss,
                User: iss,
                ObjectType: "Tag",
                Action: "DELETE",
                Application: "Lite Ticket Service"
            };
            addAuditTrail(tenant, company, iss, auditData);

            jsonString=messageFormatter.FormatMessage(undefined, "Tag category deletion succeeded", true, resTagRemove);
        }
        res.end(jsonString);
    });


};
function AttachTagsToTag(req, res){

    logger.debug("DVP-LiteTicket.AttachTagsToTag Internal method ");
    var iss = req.user.iss;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Tag.findOneAndUpdate({_id:req.params.tagid,company:company,tenant:tenant}, {

        $addToSet :{tags : req.params.id}


    },function(errAttachTag,resAttachTag)
    {
        if(errAttachTag)
        {
            jsonString=messageFormatter.FormatMessage(errAttachTag, "Attaching Tags failed", false, undefined);
        }
        else
        {
            var auditData = {
                KeyProperty: "Tag",
                OldValue: {tags : req.params.id},
                NewValue: resAttachTag,
                Description: "Tag Attached To Tag.",
                Author: iss,
                User: iss,
                ObjectType: "Tag",
                Action: "UPDATE",
                Application: "Lite Ticket Service"
            };
            addAuditTrail(tenant, company, iss, auditData);

            jsonString=messageFormatter.FormatMessage(undefined, "Attaching Tags succeeded", true, resAttachTag);
        }
        res.end(jsonString);
    });



};
function CreateTagsToTag(req, res){

    logger.debug("DVP-LiteTicket.CreateTagsToTag Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;
    var jsonString;

    var newTag = Tag({
        name:req.body.name,
        description:req.body.description,
        company:company,
        tenant:tenant

    });

    newTag.save(function (errSubTag,resSubTag) {

        console.log("New ID "+newTag._id);
        if(errSubTag)
        {
            jsonString=messageFormatter.FormatMessage(errSubTag, "Sub Tags creation failed", false, undefined);
            res.end(jsonString);
        }
        else
        {
            Tag.findOneAndUpdate({_id:req.params.id}, {
                $addToSet :{tags : resSubTag.id}

            },function(errAttachTag,resAttachTag)
            {
                if(errAttachTag)
                {
                    jsonString=messageFormatter.FormatMessage(errAttachTag, "Attaching Tags failed", false, undefined);
                }
                else
                {
                    var auditData = {
                        KeyProperty: "Tag",
                        OldValue: {tags : req.params.id},
                        NewValue: resAttachTag,
                        Description: "Tag Attached To Tag.",
                        Author: iss,
                        User: iss,
                        ObjectType: "Tag",
                        Action: "UPDATE",
                        Application: "Lite Ticket Service"
                    };
                    addAuditTrail(tenant, company, iss, auditData);

                    var tempAttachTag = resAttachTag.toJSON();
                    tempAttachTag.newTagID=resSubTag.id;
                    console.log(JSON.stringify(tempAttachTag.newTagID));
                    console.log(JSON.stringify(tempAttachTag));
                    jsonString=messageFormatter.FormatMessage(undefined, "Attaching Tags succeeded", true, tempAttachTag);
                }
                res.end(jsonString);
            });

        }

    });


};
function DetachTagsFromTag(req,res){

    logger.debug("DVP-LiteTicket.DetachTagsFromTag Internal method ");

    var jsonString;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;
    var parentTagId=req.params.tagid;
    var childTagId=req.params.id;

    Tag.findOneAndUpdate({_id:parentTagId,company:company,tenant:tenant},{"$pull":{tags:childTagId}}, function (errDetachTag,resDetachTag) {

        if(errDetachTag)
        {
            jsonString=messageFormatter.FormatMessage(errDetachTag, "Detaching Tags failed", false, undefined);
        }
        else
        {
            var auditData = {
                KeyProperty: "Tag",
                OldValue: {},
                NewValue: resDetachTag,
                Description: "Tag Detach To Tag.",
                Author: iss,
                User: iss,
                ObjectType: "Tag",
                Action: "UPDATE",
                Application: "Lite Ticket Service"
            };
            addAuditTrail(tenant, company, iss, auditData);
            jsonString=messageFormatter.FormatMessage(undefined, "Detaching Tags succeeded", false, resDetachTag)
        }
        res.end(jsonString);

    });

};
function AttachTagsToCategory(req, res){

    logger.debug("DVP-LiteTicket.AttachTagsToCategory Internal method ");

    var jsonString;
    var TagId=req.params.id;
    var CategoryId=req.params.cid;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;


    TagCategory.findOneAndUpdate({_id:CategoryId,company:company,tenant:tenant},{
        $addToSet :{tags : TagId}

    },function(errAttachCatToTag,resAttachCatToTag)
    {
        if(errAttachCatToTag)
        {
            jsonString=messageFormatter.FormatMessage(errAttachCatToTag, "Attaching Tags failed", false, undefined);
        }
        else
        {
            var auditData = {
                KeyProperty: "Tag",
                OldValue: {},
                NewValue: resAttachCatToTag,
                Description: "Attach tag to category.",
                Author: iss,
                User: iss,
                ObjectType: "Tag",
                Action: "UPDATE",
                Application: "Lite Ticket Service"
            };
            addAuditTrail(tenant, company, iss, auditData);
            jsonString=messageFormatter.FormatMessage(undefined, "Attaching Tags succeeded", true, resAttachCatToTag);
        }
        res.end(jsonString);
    });

};
function DetachTagsFromCategory(req,res){

    logger.debug("DVP-LiteTicket.DetachTagsToCategory Internal method ");

    var jsonString;
    var TagId=req.params.id;
    var CaregoryId=req.params.cid;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;

    TagCategory.findOneAndUpdate({_id:CaregoryId,company:company,tenant:tenant},{$pull:{tags:TagId}},function(errDetachCatToTag,resDetachCatToTag)
    {
        if(errDetachCatToTag)
        {
            jsonString=messageFormatter.FormatMessage(errDetachCatToTag, "Attaching Tags failed", false, undefined);
        }
        else
        {
            var auditData = {
                KeyProperty: "Tag",
                OldValue: {},
                NewValue: resDetachCatToTag,
                Description: "Delete tag to category.",
                Author: iss,
                User: iss,
                ObjectType: "Tag",
                Action: "DELETE",
                Application: "Lite Ticket Service"
            };
            addAuditTrail(tenant, company, iss, auditData);

            jsonString=messageFormatter.FormatMessage(undefined, "Attaching Tags succeeded", true, resDetachCatToTag);
        }
        res.end(jsonString);
    });


};
function CreateTagsToTagCategory(req, res){

    logger.debug("DVP-LiteTicket.CreateTagsToTagCategory Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var iss = req.user.iss;
    var jsonString;

    var newTag = Tag({
        name:req.body.name,
        description:req.body.description,
        company:company,
        tenant:tenant

    });

    newTag.save(function (errSubTag,resSubTag) {

        console.log("New ID "+newTag._id);
        if(errSubTag)
        {
            jsonString=messageFormatter.FormatMessage(errSubTag, "Sub Tags creation failed", false, undefined);
            res.end(jsonString);
        }
        else
        {
            TagCategory.findOneAndUpdate({_id:req.params.id}, {
                $addToSet :{tags : resSubTag._doc._id}

            },function(errAttachTag,resAttachTag)
            {
                if(errAttachTag)
                {
                    jsonString=messageFormatter.FormatMessage(errAttachTag, "Attaching Tags failed", false, undefined);
                }
                else
                {
                    var auditData = {
                        KeyProperty: "Tag",
                        OldValue: {},
                        NewValue: resAttachTag,
                        Description: "Create tag to category.",
                        Author: iss,
                        User: iss,
                        ObjectType: "Tag",
                        Action: "UPDATE",
                        Application: "Lite Ticket Service"
                    };
                    addAuditTrail(tenant, company, iss, auditData);
                    /*var tempAttachTag = resAttachTag.toJSON();
                    tempAttachTag.newTagID=resSubTag._doc._id;
                    console.log(JSON.stringify(tempAttachTag.newTagID));
                    console.log(JSON.stringify(tempAttachTag));*/
                    jsonString=messageFormatter.FormatMessage(undefined, "Attaching Tags succeeded", true, resSubTag);
                }
                res.end(jsonString);
            });

        }

    });


};

function UpdateTagCategoryName(req, res){

    logger.debug("DVP-LiteTicket.UpdateTagCategoryName Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var updateObj = {
        name:req.body.name,
        company:company,
        tenant:tenant
    };



    TagCategory.findOneAndUpdate({_id:req.params.id},updateObj,function (err,resp) {

        if(err)
        {
            jsonString=messageFormatter.FormatMessage(err, "Updating Tag Category failed", false, undefined);
        }
        else
        {
            jsonString=messageFormatter.FormatMessage(undefined, "Tag Category update succeeded", true, resp);
        }
        res.end(jsonString);
    });



};
function UpdateTagName(req, res){

    logger.debug("DVP-LiteTicket.UpdateTagName Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var updateObj = {
        name:req.body.name,
        company:company,
        tenant:tenant
    };



    Tag.findOneAndUpdate({_id:req.params.id},updateObj,function (err,resp) {

        if(err)
        {
            jsonString=messageFormatter.FormatMessage(err, "Updating Tag failed", false, undefined);
        }
        else
        {
            jsonString=messageFormatter.FormatMessage(undefined, "Tag update succeeded", true, resp);
        }
        res.end(jsonString);
    });



};


module.exports.CreateTag = CreateTag;
module.exports.GetTags = GetTags;
module.exports.GetTag = GetTag;
module.exports.AttachTagsToTag = AttachTagsToTag;
module.exports.CreateTagsToTag = CreateTagsToTag;
module.exports.DeleteTag = DeleteTag;
module.exports.DetachTagsFromTag = DetachTagsFromTag;
module.exports.CreateTagCategory = CreateTagCategory;
module.exports.RemoveTagCategory = RemoveTagCategory;
module.exports.AttachTagsToCategory = AttachTagsToCategory;
module.exports.DetachTagsFromCategory = DetachTagsFromCategory;
module.exports.GetTagCategory = GetTagCategory;
module.exports.GetTagCategories = GetTagCategories;
module.exports.CreateTagsToTagCategory = CreateTagsToTagCategory;
module.exports.GetTagCategoriesWithoutPopulation = GetTagCategoriesWithoutPopulation;
module.exports.GetTagsWithoutPopulation = GetTagsWithoutPopulation;
module.exports.UpdateTagCategoryName = UpdateTagCategoryName;
module.exports.UpdateTagName = UpdateTagName;


