var express = require('express');
var fs = require('fs');
var net = require('net');
var nconf = require('nconf');
var rimraf = require('rimraf');
var GeoStore = require('terraformer-geostore').GeoStore;
var RTree = require('terraformer-rtree').RTree;
var LevelStore = require('terraformer-geostore-leveldb');
var Terraformer = require('terraformer');
var Statistics = require('./usage-statistics/index.js');

// config
nconf.argv().env();
nconf.file({ file: 'config.json' });
nconf.defaults({
    'http': {
      'port': 8081
    },
    'localsocket': {
      'file': '/tmp/simple-geojson-server.sock'
    },
    'statistics': {
      'file': 'statistics.json'
    },
    'services': {}
});
nconf.save();

// start
console.log("Starting simple-geojson-server");

// init statistics
var stats = new Statistics(nconf.get('statistics:file'));

// init services
var serviceStates = {
    STARTING: 0,
    ERROR: 1,
    READY: 2
};
var services = nconf.get('services');
for (var key in services) {
  services[key].store = null;
  services[key].status = serviceStates.STARTING;

  updateStore(key);
}

function updateStore(service) {
  console.log("Updating service ", service);
  // read file // TODO use a more memory-efficient way to parse data (json-stream)
  fs.readFile(services[service].file, 'utf8', function (err, data) {
    if (err) {
      console.log( "Accessing file for service ", service,  "failed: ", err );
      services[key].status = serviceStates.ERROR;
    }
    else {
      // create new store
      var store = new GeoStore({
        store: new LevelStore("LevelStore/"+service+"_"+Math.random().toString(36).substr(2, 9)+".leveldb"),
        index: new RTree()
      });
      // process file
      var jsonData = null;
      try {
        jsonData = JSON.parse(data);
      }
      catch(err) {
        console.log( "Parsing data for service ", service,  "failed: ", err );
        services[key].status = serviceStates.ERROR;
      }
      if (jsonData!=null) {
        store.add(jsonData, function (err, res) {
          if (err) {
            console.log( "Processing data for service ", service,  "failed: ", err );
            services[key].status = serviceStates.ERROR;
          }
          else {
            // apply new store
            var oldStore = services[key].store;
            services[key].store = store;
            services[key].status = serviceStates.READY;
            console.log("New database of Service ", service, " ready");
            // delete old store
            if (oldStore != null) {
              closeLevelStore(oldStore.store);
            }
          }
        });
      }
    }
  });
}

function closeLevelStore(levelStore,callback) {
  console.log("Removing database ", levelStore.name);
  levelStore.close(function(err) {
    if (err) {
      console.log("Removing database ", levelStore.name, " failed");
    }
    else {
      rimraf(levelStore.name, function(err) {
        if (err) {
          console.log("Removing database ", levelStore.name, " failed");
        }
        else {
          console.log("Removing database ", levelStore.name, " done");
        }
        if (callback)
          callback();
      });
    }
  });
}

// REST API
var app = express();

// set encoding
app.use(function (req, res, next) {
  res.header("Content-Type", "application/json; charset=utf-8");
  next();
});

// choose service
app.param('serviceId', function(req, res, next, id) {
  var service = services[id];

  if (service == null) {
    res.status(404).send('Service not found').end();
  }
  else if (service.status == serviceStates.STARTING) {
    res.status(404).send('Service not ready yet').end();
  }
  else if (service.status == serviceStates.ERROR) {
    res.status(500).send('Service is unavailable').end();
  }
  else {
    req.service = service;

    // stats
    stats.hit(id);

    next();
  }
});

// query all entrys by position/distance and sort
app.get('/:serviceId/', function (req, res) {
  // validate input
  if ( !('radius' in req.query && 'lat' in req.query && 'lng' in req.query) ) {
    res.status(400).send('Missing parameters: "radius", "lat" and "lng" must be specified.').end();
    return;
  }

  // process params
  var radius = parseInt(req.query.radius);
  var lat = parseFloat(req.query.lat);
  var lng = parseFloat(req.query.lng);
  var sort = 'sort' in req.query ? req.query.sort : "dist";

  if (radius > req.service.radius)
    radius = req.service.radius;

  // query
  var circle = new Terraformer.Circle([lng, lat], radius, 32);

  req.service.store.within(
    circle.geometry,
    function (err, data) {
      if (err) {
        res.status(500).send('Service error').end();
      }
      else {
        // from: http://stackoverflow.com/questions/27928/calculate-distance-between-two-latitude-longitude-points-haversine-formula
        function distance(lat1, lon1, lat2, lon2) {
          var p = 0.017453292519943295;    // Math.PI / 180
          var c = Math.cos;
          var a = 0.5 - c((lat2 - lat1) * p)/2 +
                  c(lat1 * p) * c(lat2 * p) *
                  (1 - c((lon2 - lon1) * p))/2;

          return 12742 * Math.asin(Math.sqrt(a)) * 1000; // 2 * R; R = 6371 km (and multiplied * 1000 to get meters)
        }

        for(var i = 0; i < data.length; i++) {
          data[i].properties.dist = distance(lat,lng,data[i].geometry.coordinates[1],data[i].geometry.coordinates[0]);
        }

        // sort
        data.sort(function(a, b) {
          if (a.properties[sort] == undefined || a.properties[sort] == null) {
            return 1;
          }
          else if (b.properties[sort] == undefined || b.properties[sort] == null) {
            return -1;
          }
          else {
            if (a.properties[sort] < b.properties[sort])
              return -1;
            else if (a.properties[sort] == b.properties[sort])
              return 0;
            else
              return 1;
          }
        });

        // limit
        data = data.slice(0,req.service.limit);

        var collection = {
          type: "FeatureCollection",
          features: data
        };

        res.end( JSON.stringify(collection) );
      }
    }
  );
})

// get details
app.get('/:serviceId/:entryId', function (req, res) {
  req.service.store.get(req.params.entryId, function(err, data) {
    if (err) {
      res.status(500).send('Service error').end();
    }
    else {
      res.end( JSON.stringify(data) );
    }
  });
})

// start server
var httpserver = app.listen(nconf.get('http:port'), function () {
  var host = httpserver.address().address;
  var port = httpserver.address().port;

  console.log("http server listening at http://%s:%s", host, port);
})

// listen on local socket
var socketserver = net.createServer(function(stream) {
  stream.on('data', function(c) {
    var args = c.toString().split(" ");
    if (args.length == 2 && args[0] == "updateService") {
      if (services[args[1].trim()] !== undefined) {
        stream.write('updating service\r\n');
        updateStore(args[1].trim());
      }
      else {
        console.log("localsocket: service not found: ", args[1]);
        stream.write('service not found\r\n');
      }
    }
    else {
      console.log("localsocket: unrecognized command: ", c.toString());
      stream.write('unrecognized command\r\n');
    }
  });
});

socketserver.listen(nconf.get('localsocket:file'), function() {
  console.log("local socket listening at ", nconf.get('localsocket:file'));
});

// clean exit
process.stdin.resume();
function shutdown(code) {
  console.log("Shutting down");

  try {
    var asyncCounter = 0;

    //asyncCounter++;
    socketserver.close(function() {
      console.log("local socket closed");
      //asyncCounter--;
    });

    //asyncCounter++;
    httpserver.close(function() {
      console.log("http server closed");
      //asyncCounter--;
    });

    for (var key in services) {
      if (services[key].store != null) {
        asyncCounter ++;
        closeLevelStore(services[key].store.store, function() { asyncCounter--; });
        services[key].store = null;
      }
    }

    // wait until everything is shut down
    setInterval(function() {
      if (asyncCounter <= 0) {
        console.log("Shotdown complete");
        process.exit(code);
      }
    }, 1000);
  }
  catch (ex) {
    console.log("Shutdown failed", ex);
    console.log("Exit without cleanup");
    process.exit(99);
  }
}

process.on('SIGINT', function() {
  console.log('User interrupted application');
  shutdown(2);
});
process.on('uncaughtException', function(e) {
  console.log('Uncaught Exception');
  console.log(e.stack);
  shutdown(99);
});
