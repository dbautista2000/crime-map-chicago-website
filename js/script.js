"use strict";

import { areas } from "./boundaries.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/* MAP SET UP & INTERACTION */

var geojson,info,legend,map;

const mapSetup = async () => {
    /* let map = L.map('map').setView([41.867306,-87.661139],10);
    let geojson;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map); */

    let boundaries = areas;
    let crimeURL; let crimeJSON;

    if (!sessionStorage.getItem("crimeJSON")) {
        crimeURL = "https://data.cityofchicago.org/resource/xguy-4ndq.json";
        crimeJSON = await fetchCrimeAPI(crimeURL);
        sessionStorage.setItem("crimeJSON",JSON.stringify(crimeJSON));
    }
    // avoids fetching until new session occurs or session ends
    else {
        crimeJSON = JSON.parse(sessionStorage.getItem("crimeJSON"));
    }



    map = L.map('map').setView([41.867306,-87.661139],10);
    //let geojson;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    let boundaries_minMax, boundaries_min, boundaries_max;

    if (sessionStorage.getItem("boundaries")) {
        boundaries = JSON.parse(sessionStorage.getItem("boundaries"));
        
    }
    else {
        boundaries = addMapData(boundaries,crimeJSON);
        boundaries_minMax = findMinMax(boundaries);
        boundaries_min = boundaries_minMax[0];
        boundaries_max = boundaries_minMax[1];
        sessionStorage.setItem("boundaries",JSON.stringify(boundaries));
        sessionStorage.setItem("boundaries_min",boundaries_min.toString());
        sessionStorage.setItem("boundaries_max",boundaries_max.toString());
    }



    info = L.control();
    info.onAdd = function(map) {
        this._div = L.DomUtil.create('create','info');
        console.log(this._div);
        this.update();
        return this._div;
    }
    info.update = function(props) {
        this._div.innerHTML = '<h4>Neighborhood Crime Count</h4>'
        + (props ? '<b>'+capitalize(props.community)+'</b>'+'<br/>'
        + (props.crime_num ? props.crime_num : 0) + " Crimes Committed" : 'Hover over a neighborhood');
    }
    


    legend = L.control({position: 'bottomright'});
    legend.onAdd = function (map) {
        let min = parseInt(sessionStorage.getItem("boundaries_min"));
        let max = parseInt(sessionStorage.getItem("boundaries_max"));
        
        let parts = 7;
        let frac = Math.floor((max-min)/parts); // keep it whole
        // max = min + frac*n
        // (max-min)/n = frac
        var div = L.DomUtil.create('div', 'info legend'),
            grades = [min, min+frac*1, min+frac*2, min+frac*3, min+frac*4, min+frac*5, min+frac*6, min+frac*7],
            labels = [];

        // loop through our density intervals and generate a label with a colored square for each interval
        for (var i = 0; i < grades.length; i++) {
            div.innerHTML +=
                '<i style="background:' + getColor(grades[i] + 1) + '"></i> ' +
                grades[i] + (grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+');
            }

            return div;
    };

    geojson = L.geoJSON(boundaries, {
        style: mapStyle,
        onEachFeature: onEachFeature
    }).addTo(map);
    info.addTo(map);
    legend.addTo(map);

    console.log(map);
}

function onMapClick(evt) {
    buildDashboard(evt);
    zoomToFeature(evt);
}

const mapStyle = (feature) => {
    return {
        fillColor: getColor(feature.properties.crime_num),
        weight: 2,
        opacity: 1,
        color: '#999',
        //dashArray: '3',
        fillOpacity: 0.7
    };
}

const highlightFeature = evt => {
    let layer = evt.target;

    layer.setStyle({
        weight: 3,
        color: 'yellow',
        //dashArray: '',
        fillOpacity: 0.7
    });

    layer.bringToFront(); // avoids clashing with nearby states

    info.update(layer.feature.properties);
}

const resetHighlight = evt => {
    geojson.resetStyle(evt.target);
    info.update();
}

const zoomToFeature = evt => {
    //console.log(evt);
    //console.log(evt.target);
    map.fitBounds(evt.target.getBounds(),{maxZoom: 13});
}

const onEachFeature = (feature, layer) => {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: onMapClick,
    });
}

const getColor = (ct) => {
    let min = parseInt(sessionStorage.getItem("boundaries_min"));
    let max = parseInt(sessionStorage.getItem("boundaries_max"));

    let parts = 7; // 7 because there are 7 conditionals
    let frac = Math.floor((max-min)/parts); // keep it whole
    // max = min + frac*n
    // (max-min)/n = frac
    return ct > min + frac*7 ? '#99000d' :
           ct > min + frac*6 ? '#cb181d' :
           ct > min + frac*5 ? '#ef3b2c' :
           ct > min + frac*4 ? '#fb6a4a' :
           ct > min + frac*3 ? '#fc9272' :
           ct > min + frac*2 ? '#fcbba1' :
           ct > min + frac*1 ? '#fee0d2' :
                      '#fff5d0';
}

/* const onSelectChange = (target) => {
    geojson.resetStyle(target);
    info.update();
    target.setStyle({
        weight: 5,
        color: '#666',
        dashArray: '',
        fillOpacity: 0.7
    });

    target.bringToFront(); // avoids clashing with nearby states

    info.update(target.feature.properties);
    map.fitBounds(target.getBounds(),{maxZoom: 13});
} */

/*===========================*/


/* FETCH API */
const fetchCrimeAPI = async url => {
    const response = await fetch(url);
    const jsonResponse = await response.json();
    const currJsonResponse = filterJsonData(jsonResponse);

    return currJsonResponse;
}

const filterJsonData = jsonArr => {
    const filteredJson = jsonArr.filter((jsonObj) => jsonObj.year === "2023");
    return filteredJson;
}
/*===========================*/

/* DATA VALIDATION */

const addMapData = (geoJson, json) => {
    const N_hoods = geoJson.features.length; // number of neighborhoods, should be 77
    const N_data = json.length; // number of records

    // loops through all records (in object form)
    for(let i=0; i<N_data; i++) {
        // checks if community_area of record exists and is not labeled as 0
        if (json[i].community_area || json[i].community_area !== "0") {
            //console.log("COMM AREA ",i," ",geoJson);
            findNeighborhoodArea(geoJson,json[i].community_area,N_hoods);
        }

        // checks if latitude and longitude values of the record
        else if (json[i].latitude && json[i].longtitude) {
            //console.log("LATLONG ",i," ",geoJson);
            findNeighborhoodCoords(geoJson,json[i].latitude,json[i].longitude,N_hoods);
        }

        else {
            //console.log("NOTHING ",i," ",geoJson);
            continue;
        }
    }
    return geoJson;
}

const findNeighborhoodArea = (geoJson,areaNum,n_hoods) => {
    // iterates through areas.features array
    for(let j=0; j<n_hoods; j++) {

    // checks for matching area number between community_area and area_numbe 
        if (geoJson.features[j].properties.area_numbe == areaNum) {
            // checks if crime_num property already exists
            if (!!geoJson.features[j].properties.crime_num) {
                geoJson.features[j].properties.crime_num++;
            }
            else {
                geoJson.features[j].properties.crime_num = 1;
            }
            return;
        }
    }
}

const findNeighborhoodCoords = (geoJson,lat,long,n_hoods) => {

    // iterates through areas.features array
    for(let i=0;i<n_hoods;i++) {
        /*
        NOTE: for convenience's sake, in this project, Polygon != polygon: polygon is simply a shape, Polygon is a geoJSON term for a set of polygons

        coordinates is a 4-d array that defines a MultiPolygon, which is a set of Polygons
        coordinates[w] is a 3-d array that defines a Polygon, which is a set of boundaries, some may appear as holes if there's more than one element in a Polygon
        ex. Polygon: [boundaryArray,holeArray1,holeArray2,...holeArrayN]
        coordinates[w][x] is a 2-d array that defines the boundary of a polygon, which is a set of coordinates that outline the polygon (could be a hole or boundary)
        coordinates[w][x][y] is a 1-d array that defines a geoJSON coordinate in the form of (long,lat)
        coordinates[w][x][y][z] is a scalar that defines a longitude or latitude
        */
        geoPolyNum = geoJson.features[i].geometry.coordinates.length;

        // iterates through Polygons
        for(let j=0;j<geoPolyNum;j++) {
            boundaryPolyNum = geoJson.features[i].geometry.coordinates[j].length;

            // iterates through polygons/boundaries
            for(let k=boundaryPolyNum-1; k>=0; k--) {
                if (pointInPolygon([long,lat],geoJson.features[i].geometry.coordinates[j][k])) {
                    // the first element/polygon of a Polygon array is usually the main polygon that defines the polygon of a geographical area
                    if (k==0) {
                        // checks if crime_num property already exists
                        if (!!geoJson.features[j].properties.crime_num) {
                            geoJson.features[j].properties.crime_num++;
                        }
                        else {
                            geoJson.features[j].properties.crime_num = 1;
                        }
                        return;
                    }
                    else {
                        // if the point is polygon but is not the main polygon (k==0), this means it's in a hole polygon, THEREFORE not located in a geographical area
                        // do nothing, there's nothing to add up if it's not really in a geographical area
                        return;
                    }
                }
            }
        }
    }
}

const pointInPolygon = (point, poly) => {
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

    var x = point[0], y = point[1];

    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        var xi = poly[i][0], yi = poly[i][1];
        var xj = poly[j][0], yj = poly[j][1];

        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

const findMinMax = geoJson => {
    let minCrime = Infinity; let maxCrime = -Infinity;
    const N_hoods = geoJson.features.length;
    console.log(geoJson);
    for(let i=0; i<N_hoods; i++) {
        if (geoJson.features[i].properties.crime_num > maxCrime) {
            maxCrime = geoJson.features[i].properties.crime_num;
        }
        if (geoJson.features[i].properties.crime_num < minCrime) {
            minCrime = geoJson.features[i].properties.crime_num;
        }
    }

    return [minCrime,maxCrime];
}

const capitalize = (string) => {
    // Turns "WORD1 WORD2 WORD3" into "Word1 Word2 Word3" 
    return string.split(" ").map(word => {return word[0]+word.substr(1).toLowerCase();}).join(" ");

}
/*===========================*/

/* DATA VISUALIZATION */
const buildDashboard = (evt) => {
    document.querySelector('.noData').style.display = 'none';
    let dashboard = document.querySelector('.dataDash');
    dashboard.style.display = 'grid';
    /* dashboard.style.gridTemplateAreas = "'hd hd hd hd hd' 'da da da su su' 'da da da su su' 'da da da su su'"; */
    dashboard.style.gridTemplateAreas = "'hd hd hd hd' 'da da su su' 'da da su su' 'da da su su'";
    /* document.querySelector('.data').style.display = 'flex'; */
    /* document.querySelector('.dataDash__sum').innerHTML = '<p>Hello, just lookin around</p>' */


    var data = [
        {
          x: ['giraffes', 'orangutans', 'monkeys'],
          y: [20, 14, 23],
          type: 'bar'
        }
      ];
      
    
    var layout = {
        title: 'Responsive to window\'s size!',
        font: {size: 12}
    };
    
    var config = {
        staticPlot: true,
        responsive: true,
        useResizeHandler: true,
        autosize: true,
        width: '100%',
        height: '100%'};

      /* Plotly.newPlot('dataDash__data', data,layout,config); */
}
/*===========================*/


/* EVENT LISTENERS */
document.addEventListener("DOMContentLoaded", ()=>{

    //;
    mapSetup();
    console.log(map);
    /* let selectBox = document.querySelector(".main__select");
    selectBox.addEventListener("change", () => {
        let selection = selectBox.options[selectBox.selectedIndex].textContent.replace("'","").toUpperCase();
        let map_keys = Object.keys(map._layers);
        //console.log(map_keys);
        let layer_nums = map_keys.length;
        for(let i=0; i<layer_nums; i++) {
            //console.log(map_keys[i],map._layers[map_keys[i]].feature.properties.community, selection);
            try {
                if (map._layers[map_keys[i]].feature.properties.community === selection) {
                    onSelectChange(map._layers[map_keys[i]]._bounds);
                }     
            }
            catch(error) {
                continue;
            }
        }
    }); */
});

/*===========================*/

/* 
primary_type
ARSON
ASSAULT
BATTERY
BURGLARY
CONCEALED CARRY LICENSE VIOLATION
CRIMINAL DAMAGE
CRIMINAL SEXUAL ASSAULT
CRIMINAL TRESPASS
CRIM SEXUAL ASSAULT
DECEPTIVE PRACTICE
DOMESTIC VIOLENCE
GAMBLING
HOMICIDE
HUMAN TRAFFICKING
INTERFERENCE WITH PUBLIC OFFICER
INTIMIDATION
KIDNAPPING
LIQUOR LAW VIOLATION
MOTOR VEHICLE THEFT
NARCOTICS
NON - CRIMINAL
NON-CRIMINAL
NON-CRIMINAL (SUBJECT SPECIFIED)
OBSCENITY
OFFENSE INVOLVING CHILDREN
OTHER NARCOTIC VIOLATION
OTHER OFFENSE
PROSTITUTION
PUBLIC INDECENCY
PUBLIC PEACE VIOLATION
RITUALISM
SEX OFFENSE
STLAKING
THEFT
WEAPONS VIOLATION
*/