let mongoose = require('mongoose');

let questionnaireSchema = mongoose.Schema({
    id: String,
    version: String, //version in format of x.yz
    name: String,    //visible name of survey
    content: String, //JSON type string
    created: Date,
    lastUpdated: Date
});

let Questionnaire = mongoose.model('Questionnaire', questionnaireSchema);
module.exports = Questionnaire;