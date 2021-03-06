/*
 * Holds code that utilizes the i18n module's features.
 * To translate a string, pass its key to the robopaint.t() function.
 */

/**
 * Early called translate trigger for loading translations and static
 * strings.
 */
function initializeTranslation() {
  // Shoehorn settings HTML into page first...
  // Node Blocking load to get the settings HTML content in
  $('#settings').html(fs.readFileSync('resources/main.settings.inc.html').toString());
  var resources = {};

  // Get all available language JSON files from folders, add to the dropdown
  // list, and add to the rescources available.
  var i = 0;
  var i18nPath = 'resources/_i18n/';
  fs.readdirSync(i18nPath).forEach(function(file) {
    // Get contents of the language file.
    try {
      var data = JSON.parse(fs.readFileSync(i18nPath + file , 'utf8'));

      // Create new option in the pulldown language list, with the text being
      // the language's name value is the two letter language code.
      $("#lang").append(
        $("<option>")
          .text(data['_meta'].langname)
          .attr('value', data['_meta'].target)
      );

      // Add the language to the resource list.
      resources[data['_meta'].target] = { translation: data};
      //Create empty colorset key
      resources[data['_meta'].target].translation['colorsets'] = {};
      //Create empty modes key
      resources[data['_meta'].target].translation['modes'] = {};

      i += 1;
    } catch(e) {
      console.error('Bad language file:' + file, e);
    }
  });
  console.debug("Found a total of " + i + " language files.");

  // Parsing for colorset translation strings.
  try {
    // Iterate over global colorset i18n directory.
    fs.readdirSync('resources/colorsets/_i18n').forEach(function(file) {
      // Add each translation file to the global translate array.
      var data = JSON.parse(fs.readFileSync('resources/colorsets/_i18n/' + file , 'utf8'));
      resources[data['_meta'].target].translation['colorsets'] = data;
    });
  }catch(e) {
    // Catch and report errors to the console.
    console.error('Error parsing global colorset translation file: ' + file, e); }

  // Iterate over colorset folder, picking out colorset i18n files and adding
  // them to the translate array.
  fs.readdirSync('resources/colorsets/').forEach(function(folder) {
    try {
      // Ignore files that have extentions (we only want directories).
      // Ignore the 'i18n' directory (it is not a colorset!).
      if (folder.indexOf(".") == -1 && folder !== "_i18n") {
       // Create a full path to the directory containing this colorset's i18n
       // files.
        var fullPath = 'resources/colorsets/' + folder + '/_i18n/';

        //  Iterate over language files in colorset's i18n folder
        fs.readdirSync(fullPath).forEach(function(file) {
          //  Add the data to the global i18n translation array
          var data = JSON.parse(fs.readFileSync(fullPath + file , 'utf8'));
          resources[data['_meta'].target].translation['colorsets'][folder] = data;
        });
       }
  } catch(e) {
    // Catch and report errors to the console
    console.error('Bad or missing Colorset translation file for: ' + folder, e); }
  });

  // Load all mode translation files
  fs.readdirSync('resources/modes/').forEach(function(folder) {
    try {
      // Ignore files that have extentions (we only want directories).
      if (folder.indexOf(".") == -1) {
        var fullPath = 'resources/modes/' + folder + '/_i18n/';
        //  Iterate over language files in mode's i18n folder
        fs.readdirSync(fullPath).forEach(function(file) {
          if (file.indexOf('.map.json') === -1) { // Don't use translation maps.
            //  Add the data to the global i18n translation array
            var data = JSON.parse(fs.readFileSync(fullPath + file , 'utf8'));
            resources[data['_meta'].target].translation['modes'][folder] = data;
          }
        });
       }
  } catch(e) {
    // Catch and report errors to the console
    console.error('Bad or missing Mode translation file for: ' + folder, e); }
  });

  // Loop over every element in the current document scope that has a 'data-i18n' attribute that's empty
  $('[data-i18n=""]').each(function() {
    // "this" in every $.each() function, is a reference to each selected DOM object from the query.
    // Note we have to use $() on it to get a jQuery object for it. Do that only once and save it in a var
    // to keep your code from having to instantiate it more than once.
    var $node = $(this);
    // Check if the text contains a dot (will prevent it from accidentally
    // overwriitng existing data in i18n attribute) and if the existing
    // i18n attribute is empty
    if ($node.text().indexOf('.') > -1 && $node.attr('data-i18n') == "") {
      $node.attr('data-i18n', $node.text());
      // This leaves the text value of the node intact just in case it doesn't translate and someone is debugging,
      // they'll be able to see the exact translation key that is a problem in the UI.
    }
  });

  // Set default language if none set!
  if (!localStorage['robopaint-lang']) {
    localStorage['robopaint-lang'] = navigator.language;
    var navCode = localStorage['robopaint-lang'].split('-')[0].toLowerCase();
    var langSet = false;

    $('#lang option').each(function(){
      var code = $(this).val().toLowerCase();
      var lCode = code.split('-')[0].toLowerCase();
      if (code == localStorage['robopaint-lang'].toLowerCase()) {
        $('#lang').val(localStorage['robopaint-lang']);
        langSet = true;
        return false; // Best match, loop is done!
      } else if (lCode == navCode) { // Match best for language code only
        localStorage['robopaint-lang'] = $(this).val();
        $('#lang').val($(this).val());
        langSet = true;
      }
    });

    // If we couldn't match the user's language to one we have, default to en-US
    if (!langSet) {
      localStorage['robopaint-lang'] = 'en-US';
      $('#lang').val('en-US');
    }
  } else {
    // Set the language dropdown value (nothing else takes this over)
    $('#lang').val(localStorage['robopaint-lang']);
  }

  $('#bar-translate').click(function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!$('#lang ul.dd-options').is('visible')) {
      $('#lang').ddslick('open');
    }
  });

  i18n.init({
    resStore: resources,
    ns: 'translation',
    fallbackLng: 'en-US',
    lng: localStorage['robopaint-lang']
  }, function(t) {
    robopaint.t = t;
    currentLang = localStorage['robopaint-lang'];
    $('[data-i18n]').i18n();
    setVersion();

    // Apply bolding to settings details text
    $('aside').each(function(){
      $(this).html($(this).text().replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
    });

    // Bind & setup the global translation toolbar button
    $('#lang').ddslick({
      width: 110,
      onSelected: updateLang
    });

    // Run main window initialization
    startInitialization();
  });
}

/**
 * DRY helper function to set the version text
 */
function setVersion() {
  // Set visible version from manifest (with appended bot type if not WCB)
  // This has to be done here because it's one of the few out of phase translations
  var bt = robopaint.currentBot.type != "watercolorbot" ? ' - ' + robopaint.currentBot.name : '';
  $('span.version').text('('+ robopaint.t('nav.toolbar.version') + gui.App.manifest.version + ')' + bt);
}

/**
 * Reloads language file and updates any changes to it.
 * Called when the language is changed in the menu list.
 */
function updateLang() {
  // Get the index pointer from the dropdown menu.
  localStorage['robopaint-lang'] = $('#lang').data('ddslick').selectedData.value;

  // Abort the subroutine if the language has not changed (or on first load)
  if (currentLang == localStorage['robopaint-lang']) {
    return;
  }

  currentLang = localStorage['robopaint-lang'];

  // Change the language on i18n, and reload the translation variable.
  i18n.setLng(
    localStorage['robopaint-lang'],
    function(t) {
      robopaint.t = t;
      $('[data-i18n]').i18n();
      setVersion();

      // Apply bolding to settings details text
      $('aside').each(function(){
        $(this).html($(this).text().replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
      });

      // Report language switch to the console
      console.info("Language Switched to: " + localStorage['robopaint-lang']);

      $('input[type=range]').change(); // Update dynamic slider labels
      getColorsets(); // Reload and reparse colorsets

      // Translate the mode if we're not on home
      if (appMode !== 'home') translateMode();
    }
  );
}


/**
 * Translate a mode, in either native or DOM map format. Will also trigger
 * translateComplete() function on window object of mode.
 */
function translateMode() {
  var mode = robopaint.modes[appMode];

  // DOM Map or native parsing?
  if (mode.i18n == 'dom') {
    var domFile = 'resources/' + mode.root + '_i18n/' + mode.name + '.map.json';
    try {
      var mappings = JSON.parse(fs.readFileSync(domFile , 'utf8'))['map'];
      for (var selector in mappings) {
        var $elements = $(selector, $subwindow.contents());

        if ($elements.length === 0) {
          console.debug("TranslationDOM Map selector not found:", selector);
        }

        // When creating DOM map and i18n for non-native modes, it helps to know
        // which ones are done, and which aren't!
        var debugExtra = ""; //"XXX";

        // Replace text or specific attributes?
        var i18nKey = mappings[selector];
        if (typeof i18nKey === 'string') {
          // Can't use .text() as it will replace child nodes!
          $elements.each(function(){ // Just in case we select multiple elements.
            $(this)
              .contents()
              .filter(function(){ return this.nodeType == 3; })
              .first()
              .replaceWith(robopaint.t(i18nKey) + debugExtra);
          });
        } else if (typeof i18nKey === 'object') {
          for (var attr in i18nKey) {
            $elements.each(function(){ // Just in case we select multiple elements.
              if (attr === 'text') {
                $(this)
                  .contents()
                  .filter(function(){ return this.nodeType == 3; })
                  .first()
                  .replaceWith(robopaint.t(i18nKey.text) + debugExtra);
              } else {
                $(this).attr(attr, robopaint.t(i18nKey[attr]) + debugExtra);
              }
            });
          }
        }
     }

    } catch(e) {
      console.error('Bad DOM location file:' + domFile, e);
    }
  } else { // Native i18n parsing! (much simpler)
    // Quick fix for non-reactive re-translate for modes
    $('[data-i18n=""]', $subwindow.contents()).each(function() {
      var $node = $(this);
      if ($node.text().indexOf('.') > -1 && $node.attr('data-i18n') == "") {
        $node.attr('data-i18n', $node.text());
      }
    });
    $('[data-i18n]', $subwindow.contents()).i18n();
  }

  // If there's a window function for it, trigger mode translationComplete()
  if (typeof $subwindow[0].contentWindow.translateComplete === 'function') {
    $subwindow[0].contentWindow.translateComplete();
  }
}
