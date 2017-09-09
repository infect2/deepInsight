let mongoose = require('mongoose');

let participantChoiceSchema = mongoose.Schema({
    clientName: String,
    participantName: String,
    participantToken: String,
    questionnaireID: String,
    result: String
});

let ParticipantChoice = mongoose.model('participantChoice', participantChoiceSchema);
module.exports = ParticipantChoice;