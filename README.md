# simple-geojson-server

This is a simple HTTP server that reads data from [[GeoJSON|http://geojson.org/]] files and makes the data available via a RESTful API.

## Data format

All input files must be in GeoJSON format and contain a single FeatureCollection where each Feature has the `id` attribute defined. The encoding should be UTF-8.

## REST API

* `http://host:8081/<service>?radius=<radius>&lat=<lat>&lng=<lng>[&sort=<property>]`

    Selects all Features that are contained in a circle of the given radius (in metre) around the given coordinates, sorted by the given property (default: `dist`). The `dist` property is calculated and added as property for each Feature.

    Returns a FeatureCollection.

* `http://host:8081/<service>/id`

  Returns a Feature by id.

There will be more flexible queries possible in future.

## Configuration

Default `config.json`

    {
      "http": {
        "port": 8081 // port to listen to (http)
      },
      "localsocket": {
        "file": "/tmp/simple-geojson-server.sock" // control socket
      },
      "statistics": {
        "file": "statistics.json" // file where usage statistics are recorded to
      },
      "services": {
        "fuelSpain": {
          "file": "data/fuelSpain.geojson", // path to geojson file
          "limit": 25, // max number of entries in query result
          "radius": 25000 // max radius in query (in metres)
        }
      }
    }

## Starting the server

Simply run `node app.js`.

## Notify the server about data updates

When another application updated the geojson file, you may want to make the data available to the REST API without restarting the server. The server starts a local socket at `/tmp/simple-geojson-server.sock` by default. By sending `updateService <service>` you can force an update of the specified service. See `command.js` for an example how to connect to the local socket.

## Statistics

The server contains a simple hit counter that counts hits by service and day.

## Current Limitations

* Only Points are supported
* Features can only be queried by specifying a single position and radius
