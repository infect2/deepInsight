let mongoose = require('mongoose');

let surveySchema = mongoose.Schema({
    surveyName: String,
    clientName: String, //JSON type string
    questionnaireID: String,
    startDate: Date,
    endDate: Date,
    state: String, // CREATED(YET-TO-BE-STRATED) -> ONGOING -> DONE, PAUSED
    reportTemplate: String
});

let Survey = mongoose.model('survey', surveySchema);
module.exports = Survey;