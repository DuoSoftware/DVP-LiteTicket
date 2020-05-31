var mongoose = require('mongoose');
var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;
var FormMaster = require('dvp-mongomodels/model/FormMaster').FormMaster;
var FormSubmission = require('dvp-mongomodels/model/FormMaster').FormSubmission;
var FormProfile = require('dvp-mongomodels/model/FormMaster').FormProfile;
var IsolatedTagForm = require('dvp-mongomodels/model/FormMaster').FormIsolatedTag;
var messageFormatter = require('dvp-common-lite/CommonMessageGenerator/ClientMessageJsonFormatter.js');

function CreateForm(req, res) {

    logger.debug("DVP-LiteTicket.CreateForm Internal method ");
    var jsonString;
    var tenant = parseInt(req.user.tenant);
    var company = parseInt(req.user.company);


    if (req.body && req.body.name) {
        var form = FormMaster({
            name: req.body.name,
            company: parseInt(req.user.company),
            tenant: parseInt(req.user.tenant)
        });

        if (req.body.fields) {
            form.fields = req.body.fields;
        }

        form.save(function (err, form) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Form save failed", false, undefined);
                res.end(jsonString);
            } else {


                jsonString = messageFormatter.FormatMessage(undefined, "Form saved successfully", true, form);
                res.end(jsonString);
            }
        });
    } else {


        jsonString = messageFormatter.FormatMessage(undefined, "Requre fields not found", false, undefined);
        res.end(jsonString);

    }


};

function AddOrUpdateIsolatedTagForm(req, res) {

    logger.debug("DVP-LiteTicket.UpdateForm Internal method ");
    var jsonString;
    var tenant = parseInt(req.user.tenant);
    var company = parseInt(req.user.company);


    if (req.body && req.params.id)
    {
        IsolatedTagForm.findOne({
                isolated_tag: req.body.isolated_tag,
                company: parseInt(company),
                tenant: parseInt(tenant)
            }, function (err1, isolatedTagFrm) {

            if(isolatedTagFrm)
            {
                //update
                isolatedTagFrm.dynamicForm = req.params.id;

                isolatedTagFrm.update(isolatedTagFrm, function(err, updateRes)
                {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Update Isolated Tag Form Failed", false, null);
                        res.end(jsonString);

                    } else {

                        jsonString = messageFormatter.FormatMessage(null, "Update Form successful", true, updateRes);
                        res.end(jsonString);

                    }
                })
            }
            else
            {
                if(err1)
                {
                    jsonString = messageFormatter.FormatMessage(err1, "Get isolated tag form error", false, null);
                    res.end(jsonString);
                }
                else
                {
                    var isolatedTagForm = IsolatedTagForm({
                        isolated_tag: req.body.isolated_tag,
                        company: parseInt(company),
                        tenant: parseInt(tenant),
                        dynamicForm: req.params.id
                    });

                    isolatedTagForm.save(function (err, form) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Form save failed", false, undefined);
                            res.end(jsonString);
                        } else {


                            jsonString = messageFormatter.FormatMessage(undefined, "Form saved successfully", true, form);
                            res.end(jsonString);
                        }
                    });
                }
            }


            });


    } else {


        jsonString = messageFormatter.FormatMessage(undefined, "Requred fields not found", false, undefined);
        res.end(jsonString);

    }


};

function GetFormByTag(req, res) {


    logger.debug("DVP-LiteTicket.GetFormByTag Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    IsolatedTagForm.findOne({isolated_tag: req.params.isolated_tag, company: company, tenant: tenant}).populate('dynamicForm').exec(function (err, form) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Form Failed", false, null);

        } else {

            if (form) {
                var userObj;
                jsonString = messageFormatter.FormatMessage(err, "Get Form Successful", true, form);

            } else {

                jsonString = messageFormatter.FormatMessage(null, "No Form found", true, null);

            }

        }

        res.end(jsonString);
    });

};

function GetFormsByTags(req, res) {


    logger.debug("DVP-LiteTicket.GetFormsByTags Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var tagArr = req.body.isolated_tags;
    var emptyArr = [];
    var jsonString;
    IsolatedTagForm.find({isolated_tag: { $in: tagArr }, company: company, tenant: tenant}).populate('dynamicForm').exec(function (err, forms) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Forms By Tags Failed", false, emptyArr);

        } else {

            if (forms) {
                jsonString = messageFormatter.FormatMessage(err, "Get Forms By Tags Successful", true, forms);

            } else {

                jsonString = messageFormatter.FormatMessage(null, "No Forms for Tags found", true, emptyArr);

            }

        }

        res.end(jsonString);
    });

};

function GetAllFormsByTags(req, res) {


    logger.debug("DVP-LiteTicket.GetFormsByTags Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var emptyArr = [];
    var jsonString;
    IsolatedTagForm.find({company: company, tenant: tenant}).populate('dynamicForm').exec(function (err, forms) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Forms Failed", false, emptyArr);

        } else {

            if (forms) {
                jsonString = messageFormatter.FormatMessage(err, "Get Forms Successful", true, forms);

            } else {

                jsonString = messageFormatter.FormatMessage(null, "No Forms found", true, emptyArr);

            }

        }

        res.end(jsonString);
    });

};

function DeleteIsolatedTagForm(req, res) {

    logger.debug("DVP-LiteTicket.DeleteIsolatedTagForm Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    IsolatedTagForm.findOneAndRemove({isolated_tag: req.params.isolatedTag, company: company, tenant: tenant}, function (err, delForm) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Delete Isolated Tag Form failed", false, null);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Delete Isolated Tag Form Success", true, null);
        }
        res.end(jsonString);
    });

};


function GetForms(req, res) {


    logger.debug("DVP-LiteTicket.GetForms Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    FormMaster.find({company: company, tenant: tenant}, function (err, forms) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Forms Failed", false, undefined);

        } else {

            if (forms) {


                jsonString = messageFormatter.FormatMessage(err, "Get Forms Successful", true, forms);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Forms Found", false, undefined);

            }
        }

        res.end(jsonString);
    });


};
function GetForm(req, res) {


    logger.debug("DVP-LiteTicket.GetForm Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    FormMaster.findOne({name: req.params.name, company: company, tenant: tenant}, function (err, form) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Form Failed", false, undefined);

        } else {

            if (form) {
                var userObj;
                jsonString = messageFormatter.FormatMessage(err, "Get Form Successful", true, form);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Form found", false, undefined);

            }

        }

        res.end(jsonString);
    });

};
function DeleteForm(req, res) {

    logger.debug("DVP-LiteTicket.DeleteForm Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    FormMaster.findOneAndRemove({name: req.params.name, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Delete Form failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Delete Form Success", true, undefined);
        }
        res.end(jsonString);
    });

};
function AddDynamicField(req, res) {


    logger.debug("DVP-LiteTicket.AddDynamicField Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    req.body.updated_at = Date.now();
    FormMaster.findOneAndUpdate({name: req.params.name, company: company, tenant: tenant}, {
        $addToSet: {
            fields: {
                field: req.body.field,
                type: req.body.type,
                description: req.body.description,
                title: req.body.title,
                active: req.body.activw,
                require: req.body.require,
                values: req.body.values
            }
        }
    }, function (err, fields) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Add Dynamic Fields Failed", false, undefined);

        } else {

            jsonString = messageFormatter.FormatMessage(undefined, "Add Dynamic Fields Successful", true, fields);

        }

        res.end(jsonString);
    });


};
function RemoveDynamicField(req, res) {

    logger.debug("DVP-LiteTicket.RemoveDynamicField Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    FormMaster.findOneAndUpdate({
        name: req.params.name,
        company: company,
        tenant: tenant
    }, {$pull: {'fields': {'field': req.params.field}}}, function (err, fields) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Remove Dynamic Fields Failed", false, undefined);


        } else {

            jsonString = messageFormatter.FormatMessage(undefined, "Remove Dynamic Fields successfully", false, fields);

        }

        res.end(jsonString);


    });

};
function UpdateDynamicField(req, res) {


    logger.debug("DVP-LiteTicket.GetForm Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    FormMaster.update({name: req.params.name, company: company, tenant: tenant, 'fields.field': req.params.field}, {
        $set: {
            "fields.$.field": req.body.field,
            "fields.$.type": req.body.type,
            "fields.$.description": req.body.description,
            "fields.$.title": req.body.title,
            "fields.$.active": req.body.active,
            "fields.$.require": req.body.require,
            "fields.$.values": req.body.values
        }
    }, {upsert: true}, function (err, form) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Form Failed", false, undefined);
            res.end(jsonString);

        } else {

            jsonString = messageFormatter.FormatMessage(undefined, "Update Field successful", true, form);
            res.end(jsonString);

        }

    });

};
function CreateFormSubmission(req, res) {

    logger.debug("DVP-LiteTicket.CreateFormSubmission Internal method ");
    var jsonString;
    var tenant = parseInt(req.user.tenant);
    var company = parseInt(req.user.company);


    if (req.body && req.body.form && req.body.reference) {


        FormMaster.findOne({name: req.body.form, company: company, tenant: tenant}, function (err, formmaster) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Get Form Failed", false, undefined);
                res.end(jsonString);

            } else {

                if (formmaster) {

                    var form = FormSubmission({

                        form: formmaster.id,
                        reference: req.body.reference,
                        company: parseInt(req.user.company),
                        tenant: parseInt(req.user.tenant),
                        fields: req.body.fields

                    });


                    form.save(function (err, formsub) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Form save failed", false, undefined);
                            res.end(jsonString);
                        } else {


                            jsonString = messageFormatter.FormatMessage(undefined, "Form saved successfully", true, formsub);
                            res.end(jsonString);
                        }
                    });

                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No Form found", false, undefined);
                    res.end(jsonString);

                }

            }


        });


    } else {


        jsonString = messageFormatter.FormatMessage(undefined, "Require fields not found", false, undefined);
        res.end(jsonString);

    }


};
function UpdateFormSubmission(req, res) {


    logger.debug("DVP-LiteTicket.UpdateDynamicFieldSubmission Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    FormMaster.findOne({_id: req.body.form, company: company, tenant: tenant}, function (err, formmaster) {

        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Form Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (formmaster) {

                FormSubmission.findOneAndUpdate({
                        reference: req.params.reference,
                        company: company,
                        tenant: tenant},
                    {
                        form: formmaster.id,
                        fields: req.body.fields
                    }, function (err, form) {
                        if (err) {

                            jsonString = messageFormatter.FormatMessage(err, "Get Form Failed", false, undefined);
                            res.end(jsonString);

                        } else {

                            jsonString = messageFormatter.FormatMessage(undefined, "Update Field successful", true, form);
                            res.end(jsonString);

                        }

                    });

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Form found", false, undefined);
                res.end(jsonString);

            }
        }


    });



};
function GetFormSubmissions(req, res) {


    logger.debug("DVP-LiteTicket.GetFormSubmissions Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    FormSubmission.find({company: company, tenant: tenant}).populate('FormMaster').exec(function (err, forms) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Forms Failed", false, undefined);

        } else {

            if (forms) {


                jsonString = messageFormatter.FormatMessage(err, "Get Forms Successful", true, forms);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Forms Found", false, undefined);

            }
        }

        res.end(jsonString);
    });


};
function GetFormSubmission(req, res) {


    logger.debug("DVP-LiteTicket.GetFormSubmission Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    FormSubmission.findOne({
        reference: req.params.reference,
        company: company,
        tenant: tenant
    }).populate('form').exec(function (err, form) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Form Failed", false, undefined);

        } else {

            if (form) {
                var userObj;
                jsonString = messageFormatter.FormatMessage(err, "Get Form Successful", true, form);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Form found", false, undefined);

            }

        }

        res.end(jsonString);
    });

};

function DeleteFormSubmission(req, res) {

    logger.debug("DVP-LiteTicket.DeleteFormSubmission Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    FormSubmission.findOneAndRemove({
        reference: req.params.reference,
        company: company,
        tenant: tenant
    }, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Delete Form failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Delete Form Success", true, undefined);
        }
        res.end(jsonString);
    });

};
function AddDynamicFieldSubmission(req, res) {


    logger.debug("DVP-LiteTicket.AddDynamicFieldSubmission Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    req.body.updated_at = Date.now();
    FormSubmission.findOneAndUpdate({reference: req.params.reference, company: company, tenant: tenant}, {
        $addToSet: {
            fields: {
                field: req.body.field,
                value: req.body.value
            }
        }
    }, function (err, fields) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Add Dynamic Fields Failed", false, undefined);

        } else {

            jsonString = messageFormatter.FormatMessage(undefined, "Add Dynamic Fields Successful", true, fields);

        }

        res.end(jsonString);
    });


};
function RemoveDynamicFieldSubmission(req, res) {

    logger.debug("DVP-LiteTicket.RemoveDynamicFieldSubmission Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    FormSubmission.findOneAndUpdate({
        reference: req.params.reference,
        company: company,
        tenant: tenant
    }, {$pull: {'fields': {'field': req.params.field}}}, function (err, fields) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Remove Dynamic Fields Failed", false, undefined);


        } else {

            jsonString = messageFormatter.FormatMessage(undefined, "Remove Dynamic Fields successfully", false, fields);

        }

        res.end(jsonString);


    });

};
function UpdateDynamicFieldSubmission(req, res) {


    logger.debug("DVP-LiteTicket.UpdateDynamicFieldSubmission Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    FormSubmission.findOneAndUpdate({
        reference: req.params.reference,
        company: company,
        tenant: tenant,
        'fields.field': req.params.field
    }, {
        $set: {
            "fields.$.value": req.body.value
        }
    }, {upsert: true}, function (err, form) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Form Failed", false, undefined);
            res.end(jsonString);

        } else {

            jsonString = messageFormatter.FormatMessage(undefined, "Update Field successful", true, form);
            res.end(jsonString);

        }

    });

};


function CreateFormProfile(req, res) {

    logger.debug("DVP-LiteTicket.CreateForm Internal method ");
    var jsonString;
    var tenant = parseInt(req.user.tenant);
    var company = parseInt(req.user.company);


    var form = FormProfile({
        company: parseInt(req.user.company),
        tenant: parseInt(req.user.tenant),
        ticket_form: req.body.ticket_form,
        profile_form: req.body.profile_form
    });


    form.save(function (err, form) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Form Profile save failed", false, undefined);
            res.end(jsonString);
        } else {


            jsonString = messageFormatter.FormatMessage(undefined, "Form Profile saved successfully", true, form);
            res.end(jsonString);
        }
    });

}
function GetFormProfile(req, res){

    logger.debug("DVP-LiteTicket.GetFormProfile Internal method ");
    var jsonString;
    var tenant = parseInt(req.user.tenant);
    var company = parseInt(req.user.company);


    FormProfile.findOne({company: company, tenant: tenant}).populate("ticket_form").populate("profile_form").exec(
        function(err, forms) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get Form Profile Failed", false, undefined);
            }else {
                if (forms) {
                    jsonString = messageFormatter.FormatMessage(err, "Get Form Profile Successful", true, forms);
                }else{
                    jsonString = messageFormatter.FormatMessage(undefined, "No Form Profile Found", false, undefined);
                }
            }
            res.end(jsonString);
        });

}
function UpdateFormProfile(req, res){

    logger.debug("DVP-LiteTicket.CreateForm Internal method ");
    var jsonString;
    var tenant = parseInt(req.user.tenant);
    var company = parseInt(req.user.company);

    var tempTicketForm = req.body.ticket_form;
    var tempProfileForm = req.body.profile_form;

    if(!tempProfileForm)
    {
        tempProfileForm = null;
    }

    if(!tempTicketForm)
    {
        tempTicketForm = null;
    }


    FormProfile.findOneAndUpdate({company: company, tenant: tenant}, {
        ticket_form: tempTicketForm,
        profile_form: tempProfileForm},
        function(err, forms) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Form Profile Failed", false, undefined);
        }else {
            if (forms) {
                jsonString = messageFormatter.FormatMessage(err, "Form Profile Successful", true, forms);
            }else{
                jsonString = messageFormatter.FormatMessage(undefined, "No Form Profile Found", false, undefined);
            }
        }
        res.end(jsonString);
    });



}

module.exports.CreateForm = CreateForm;
module.exports.GetForm = GetForm;
module.exports.GetForms = GetForms;
module.exports.DeleteForm = DeleteForm;
module.exports.AddDynamicField = AddDynamicField;
module.exports.RemoveDynamicField = RemoveDynamicField;
module.exports.UpdateDynamicField = UpdateDynamicField;


module.exports.CreateFormSubmission = CreateFormSubmission;
module.exports.GetFormSubmission = GetFormSubmission;
module.exports.GetFormSubmissions = GetFormSubmissions;
module.exports.UpdateFormSubmission = UpdateFormSubmission;
module.exports.DeleteFormSubmission = DeleteFormSubmission;
module.exports.AddDynamicFieldSubmission = AddDynamicFieldSubmission;
module.exports.RemoveDynamicFieldSubmission = RemoveDynamicFieldSubmission;
module.exports.UpdateDynamicFieldSubmission = UpdateDynamicFieldSubmission;

module.exports.CreateFormProfile = CreateFormProfile;
module.exports.UpdateFormProfile = UpdateFormProfile;
module.exports.GetFormProfile = GetFormProfile;
module.exports.AddOrUpdateIsolatedTagForm = AddOrUpdateIsolatedTagForm;
module.exports.GetFormByTag = GetFormByTag;
module.exports.GetFormsByTags = GetFormsByTags;
module.exports.GetAllFormsByTags = GetAllFormsByTags;
module.exports.DeleteIsolatedTagForm = DeleteIsolatedTagForm;


