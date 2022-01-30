const fs = require('fs');
const https = require('https');
const path = require('path');
const parse = require('node-html-parser');
const jsdom = require('jsdom');

const sections = [
  'https://www.ebidat.de/cgi-bin/ebidat.pl?id=',
  'https://www.ebidat.de/cgi-bin/ebidat.pl?m=h&id=',
  'https://www.ebidat.de/cgi-bin/ebidat.pl?m=o&id=',
  'https://www.ebidat.de/cgi-bin/ebidat.pl?m=g&id=',
  'https://www.ebidat.de/cgi-bin/ebidat.pl?m=n&id='
];

/**
 * Perform Actions
 */

const max = 4;
const rawDir = './raw-data/';
const jsonDir = './json-data/';

// Download new data from EBIDAT, then parse once the downloads are complete
// This can take a long time, will save to the raw-data folder
// loadFromEbidat(1, 0, parseDownloadedFiles);

// Parse downloaded data
parseDownloadedFiles();

/**
 * Download from EBIDAT
 */

function loadFromEbidat(index = 1, section = 0, callback = null) {
  console.log(`Looking for a source at index ${index}`);

  // Make sure the file path exists so it can be written to
  let filePath = `${rawDir}${index}/entry-${index}-${section}.html`;
  ensureDirectoryExistence(filePath);
  const file = fs.createWriteStream(filePath);

  // Assemble the query url by combining the correct section with the index
  let url = sections[section] + index;

  console.log(' ' + url);

  const request = https.get(url, function (response) {
    response.pipe(file);

    console.log('  --> Saved to ' + filePath);

    // Determine if the next query of the current index should be loaded
    // Or if the next index should be loaded (with the query index reset)
    section++;
    if (section == sections.length) {
      section = 0;
      index++;
    }

    if (index < max) {
      // Load the next url
      loadFromEbidat(index, section, callback);
    } else {
      console.log('Downloads complete.');
      callback();
    }
  });
}

function ensureDirectoryExistence(filePath) {
  let dir = path.dirname(filePath);
  if (fs.existsSync(dir)) {
    return true;
  }
  ensureDirectoryExistence(dir);
  fs.mkdirSync(dir);
}

/**
 * Parse downloaded files to json
 */

function parseDownloadedFiles() {
  const dirMain = fs.readdir(rawDir, function (err, dirs) {
    if (err) {
      return console.log(`Unable to scan directory: ${err}`);
    }

    // Each folder in 'dirs' contains 5 files.
    // Combine the contents of the files into one .json file and store it in json-data

    parseNext();

    // Section categories in order of index
    const sectionNames = [
      'history',
      'properties',
      'physical',
      'tourism',
      'references'
    ];

    function parseNext(index = 0) {
      let dir = dirs[index];
      console.log('==== ' + dir);

      let dirEntry = fs.readdir(`${rawDir}${dir}`, function (err, files) {
        let combinedContent = {};

        files.forEach(function (file) {
          // Read the file
          let url = path.resolve(__dirname, `${rawDir}${dir}/${file}`);

          let data = null;
          try {
            data = fs.readFileSync(url, 'utf8');
          } catch (err) {}

          // Get the id and section from the file name
          let arr = file.match(/([0-9]+)/gi);
          let id = arr[0];
          let section = arr[1];

          // Add the data to the combined object
          combinedContent['id'] = id;
          combinedContent[sectionNames[section]] = data;
        });

        const object = parseToJson(combinedContent);
        try {
          let filePath = `${jsonDir}${object.id}.json`;
          console.log(filePath);
          ensureDirectoryExistence(filePath);
          fs.writeFileSync(filePath, JSON.stringify(object));
        } catch (err) {
          console.error(err);
        }

        if (++index < dirs.length) {
          parseNext(index);
        }
      });
    }
  });
}

function parseToJson(u) {
  const history = new jsdom.JSDOM(u.history);
  const properties = new jsdom.JSDOM(u.properties);
  const physical = new jsdom.JSDOM(u.physical);
  const tourism = new jsdom.JSDOM(u.tourism);
  const references = new jsdom.JSDOM(u.references);

  let o = { id: u.id };

  /**
   * History
   */

  // Title
  const titleEl = history.window.document.querySelector('h2');
  o.title = titleEl.textContent;

  // Timeline (Geschichte)
  const timelineEl = history.window.document.querySelector(
    'section > article.beschreibung > h3 + p:nth-of-type(1)'
  );
  o.timeline = timelineEl ? timelineEl.textContent : null;

  // Building Development (Bauentwicklung)
  const buildingDevelopmentEl = history.window.document.querySelector(
    'section > article.beschreibung > h3 + p:nth-of-type(2)'
  );
  o.buildingDevelopment = buildingDevelopmentEl
    ? buildingDevelopmentEl.textContent
    : null;

  // Building Description (Baubeschreibung)
  const buildingDescriptionEl = history.window.document.querySelector(
    'section > article.beschreibung > h3 + p:nth-of-type(3)'
  );
  o.buildingDescription = buildingDescriptionEl
    ? buildingDescriptionEl.textContent
    : null;

  /**
   * Properties
   */

  // Properties are assumed to be in order with no gaps

  const propertyNames = [
    'Country',
    'State',
    'Region',
    'County',
    'City',
    'Structure Type',
    'Classification',
    'Purpose',
    'Overview',
    'Niederungslage',
    'Lagebeschreibung',
    'DatingBegin',
    'DatingEnd',
    'Condition',
    'ConditionCommentary'
  ];

  for (let i = 0; i < propertyNames.length; i++) {
    let el = properties.window.document.querySelector(
      'section > article.beschreibung > ul > li.daten:nth-of-type(1) > div.gruppenergebnis'
    );
    o[propertyNames[i]] = el ? el.textContent : null;
  }

  return o;
}
