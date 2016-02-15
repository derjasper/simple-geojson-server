var jsonfile = require('jsonfile');

function Statistics(file) {
  this.file = file;
  try {
    this.data = jsonfile.readFileSync(file);
  }
  catch (ex) {
    this.data = {};
  }

}

Statistics.prototype.save = function(callback) {
  jsonfile.writeFile(this.file, this.data, callback);
}

Statistics.prototype.hit = function(topic) {
  var date = new Date();
  var dateString = date.getUTCFullYear() + "-" + ( date.getUTCMonth()+1 < 10 ? "0" + (date.getUTCMonth()+1) : date.getUTCMonth()+1 ) + "-" + ( date.getUTCDate() < 10 ? "0" + date.getUTCDate() : date.getUTCDate() );

  var topicData = this.data[topic];
  if (topicData == undefined) {
    topicData = {};
    this.data[topic] = topicData;
  }

  if (topicData[dateString] == undefined) {
    topicData[dateString] = 0;
  }

  topicData[dateString]++;

  this.save();
}

module.exports = Statistics;
