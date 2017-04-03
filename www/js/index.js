var MyVars = {
  keepTrying: true
};

function GetURLParameter(sParam) {
  var sPageURL = window.location.search.substring(1);
  var sURLVariables = sPageURL.split('&');
  for (var i = 0; i < sURLVariables.length; i++) {
    var sParameterName = sURLVariables[i].split('=');
    if (sParameterName[0] == sParam) {
      return sParameterName[1];
    }
  }
}

$(document).ready(function () {
  // Get the tokens
  get3LegToken(function (token) {

    if (!token) {
      signIn();
    } else {
      MyVars.token3Leg = token;

      prepareFilesTree();

      MyVars.urn = GetURLParameter('urn');
      if (MyVars.urn) {
        initializeViewer(MyVars.urn);
      }
    }
  });

  $('#storyboardsButton').click(toggleStoryboardsList);
  $('#filesButton').click(toggleFilesTree);
});

function toggleStoryboardsList() {
  $('#storyboardsList').toggle();

  // Make sure the other is hidden
  $('#filesTree').hide();
}

function toggleFilesTree() {
  $('#filesTree').toggle();

  // Make sure the other is hidden
  $('#storyboardsList').hide();
}

function signIn() {
  $.ajax({
    url: '/user/authenticate',
    success: function (rootUrl) {
      location.href = rootUrl;
    }
  });
}

function get3LegToken(callback) {

  if (callback) {
    $.ajax({
      url: '/user/token',
      success: function (data) {
        MyVars.token3Leg = data.token;
        console.log('Returning new 3 legged token (User Authorization): ' + MyVars.token3Leg);
        callback(data.token, data.expires_in);
      }
    });
  } else {
    console.log('Returning saved 3 legged token (User Authorization): ' + MyVars.token3Leg);

    return MyVars.token3Leg;
  }
}

/////////////////////////////////////////////////////////////////
// Files Tree / #forgeFiles
// Shows the A360 hubs, projects, folders and files of
// the logged in user
/////////////////////////////////////////////////////////////////

function base64encode(str) {
  var ret = "";
  if (window.btoa) {
    ret = window.btoa(str);
  } else {
    // IE9 support
    ret = window.Base64.encode(str);
  }

  // Remove ending '=' signs
  // Use _ instead of /
  // Use - insteaqd of +
  // Have a look at this page for info on "Unpadded 'base64url' for "named information" URI's (RFC 6920)"
  // which is the format being used by the Model Derivative API
  // https://en.wikipedia.org/wiki/Base64#Variants_summary_table
  var ret2 = ret.replace(/=/g, '').replace(/[/]/g, '_').replace(/[+]/g, '-');

  console.log('base64encode result = ' + ret2);

  return ret2;
}

function getManifest(urn, onsuccess) {
  console.log("getManifest for urn=" + urn);
  $.ajax({
    url: '/md/manifests/' + urn,
    type: 'GET'
  }).done(function (data) {
    console.log(data);

    if (data.status !== 'failed') {
      if (data.progress !== 'complete') {
        showProgress("Translation progress: " + data.progress, data.status);

        if (MyVars.keepTrying) {
          // Keep calling until it's done
          window.setTimeout(function() {
              getManifest(urn, onsuccess);
            }, 500
          );
        } else {
          MyVars.keepTrying = true;
        }
      } else {
        //showProgress("Translation completed", data.status);
        onsuccess(data);
      }
      // if it's a failed translation best thing is to delete it
    } else {
      showProgress("Translation failed", data.status);
      // Should we do automatic manifest deletion in case of a failed one?
      //delManifest(urn, function () {});
    }
  }).fail(function(err) {
    showProgress("Translation failed", 'failed');
    console.log('GET /api/manifest call failed\n' + err.statusText);
  });
}

// We need this in order to get an OBJ file for the model
function getMetadata(urn, onsuccess) {
  console.log("getMetadata for urn=" + urn);
  $.ajax({
    url: '/md/metadatas/' + urn,
    type: 'GET'
  }).done(function (data) {
    console.log(data);

    // Get first model guid
    // If it does not exists then something is wrong
    // let's check the manifest
    // If get manifest sees a failed attempt then it will
    // delete the manifest
    var md0 = data.data.metadata[0];
    if (!md0) {
      getManifest(urn, function () {});
    } else {
      var guid = md0.guid;
      if (onsuccess !== undefined) {
        onsuccess(guid);
      }
    }
  }).fail(function(err) {
    console.log('GET /md/metadata call failed\n' + err.statusText);
  });
}

// OBJ: guid & objectIds are also needed
// SVF, STEP, STL, IGES:
// Posts the job then waits for the manifest and then download the file
// if it's created
function askForFileType(format, urn, guid, objectIds, rootFileName, fileExtType, onsuccess) {
  console.log("askForFileType " + format + " for urn=" + urn);
  var advancedOptions = {
    'stl' : {
      "format": "binary",
      "exportColor": true,
      "exportFileStructure": "single" // "multiple" does not work
    },
    'obj' : {
      "modelGuid": guid,
      "objectIds": objectIds
    }
  };

  $.ajax({
    url: '/md/export',
    type: 'POST',
    contentType: 'application/json',
    dataType: 'json',
    data: JSON.stringify(
      {
        urn: urn,
        format: format,
        advanced: advancedOptions[format],
        rootFileName: rootFileName,
        fileExtType: fileExtType
      }
    )
  }).done(function (data) {
    console.log(data);

    if (data.result === 'success' // newly submitted data
      || data.result === 'created') { // already submitted data
      getManifest(urn, function (res) {
        onsuccess(res);
      });
    }
  }).fail(function(err) {
    showProgress("Could not start translation", "fail");
    console.log('/md/export call failed\n' + err.statusText);
  });
}

function prepareFilesTree() {
  console.log("prepareFilesTree");
  $('#filesTree').jstree({
    'core': {
      'themes': {"icons": true},
      'check_callback': true, // make it modifiable
      'data': {
        "url": '/dm/treeNode',
        "dataType": "json",
        "data": function (node) {
          return {
            "href": (node.id === '#' ? '#' : node.original.href)
          };
        }
      }
    },
    'types': {
      'default': {
        'icon': 'glyphicon glyphicon-cloud'
      },
      '#': {
        'icon': 'glyphicon glyphicon-user'
      },
      'hubs': {
        'icon': 'glyphicon glyphicon-inbox'
      },
      'projects': {
        'icon': 'glyphicon glyphicon-list-alt'
      },
      'items': {
        'icon': 'glyphicon glyphicon-briefcase'
      },
      'folders': {
        'icon': 'glyphicon glyphicon-folder-open'
      },
      'versions': {
        'icon': 'glyphicon glyphicon-time'
      }
    },
    "plugins": ["types"] // let's not use sort or state: , "state" and "sort"],

  }).bind("select_node.jstree", function (evt, data) {

    if (data.node.type === 'versions') {

      MyVars.keepTrying = true;
      MyVars.selectedNode = data.node;

      // Store info on selected file
      MyVars.rootFileName = data.node.original.rootFileName;
      MyVars.fileName = data.node.original.fileName;
      MyVars.fileExtType = data.node.original.fileExtType;

      MyVars.selectedUrn = base64encode(data.node.original.wipid);

      var format = 'svf';
      askForFileType(format, MyVars.selectedUrn, null, null, MyVars.rootFileName, MyVars.fileExtType, function (manifest) {
        getMetadata(MyVars.selectedUrn, function (guid) {
          for (var derId in manifest.derivatives) {
            var der = manifest.derivatives[derId];
            // We just have to make sure there is an svf
            // translation, but the viewer will find it
            // from the urn
            if (der.outputType === 'svf') {

              toggleFilesTree();
              initializeViewer(MyVars.selectedUrn);
            }
          }
        });
      });

      console.log(
        "data.node.original.storage = " + data.node.original.storage,
        "data.node.original.wipid = " + data.node.original.wipid,
        ", data.node.original.fileName = " + data.node.original.fileName,
        ", data.node.original.fileExtType = " + data.node.original.fileExtType
      );
    } else {

      // Just open the children of the node, so that it's easier
      // to find the actual versions
      $("#filesTree").jstree("open_node", data.node);
    }
  });
}

/////////////////////////////////////////////////////////////////
// Viewer
// Based on Autodesk Viewer basic sample
// https://developer.autodesk.com/api/viewerapi/
/////////////////////////////////////////////////////////////////

function clearViewer() {
  // Clear the viewer content
  if (MyVars.viewer && MyVars.viewer.model) {
    console.log("Unloading current model from Autodesk Viewer");

    //MyVars.viewer.impl.unloadModel(MyVars.viewer.model);
    //MyVars.viewer.impl.sceneUpdated(true);
    MyVars.viewer.tearDown();
    MyVars.viewer.setUp(MyVars.viewer.config);
  }
}

function showProperties(dbId) {
  // If nothing is selected then show
  // the root info
  if (!dbId)
    dbId = 1;

  MyVars.viewer.getProperties(dbId, function (event) {
    var propertiesHtml = '<table id="propertiesTable">';
    for (var id in event.properties) {
      var prop = event.properties[id];
      if (prop.hidden)
        continue;

      propertiesHtml += '<tr><td class="property">' + prop.displayName + '</td><td class="property">' +
        prop.displayValue + '</td></tr>';
    }
    propertiesHtml += '</table>';

    $('#properties').html(propertiesHtml);
  })
}

function initializeViewer(urn, path) {
  clearViewer();

  console.log("Launching Autodesk Viewer for: " + urn);

  var options = {
    document: 'urn:' + urn,
    env: 'AutodeskProduction',
    getAccessToken: get3LegToken
  };

  if (MyVars.viewer) {
    loadDocument(MyVars.viewer, options.document, path);
  } else {
    var viewerElement = document.getElementById('forgeViewer');
    var config = {
      extensions: ['Autodesk.Fusion360.Animation']
    };
    MyVars.viewer = new Autodesk.Viewing.Private.GuiViewer3D(viewerElement, config);
    Autodesk.Viewing.Initializer(
      options,
      function () {
        MyVars.viewer.start(); // this would be needed if we also want to load extensions
        loadDocument(MyVars.viewer, options.document, path);
        MyVars.viewer.addEventListener(Autodesk.Viewing.VIEWER_RESIZE_EVENT, onModelLoaded);
        MyVars.viewer.addEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, onModelLoaded);
        MyVars.viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, function (event) {
          // Only handle the first item
          var dbId = event.dbIdArray[0];
          showProperties(dbId);
        });
        showProperties();
      }
    );
  }
}

function getImageUrl(doc, storyboard) {
  // sample URL
  // https://developer.api.autodesk.com/viewingservice/v1/thumbnails/
  // dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLlBvLWM0TzhnU05lVFFXR0RKNFlHN2c_dmVyc2lvbj0x
  // ?guid=%7B%22type%22%3A%22Animation%22%2C%22asset%22%3A%22e70f0521-0478-4734-bc2c-d3fd8f68b497%22%2C%22objectId%22%3A27%7D
  // &width=200&height=200

  var urn = doc.myPath.replace('urn:', '');
  var url = "https://developer.api.autodesk.com/viewingservice/v1/thumbnails/" + urn + "?";

  if (storyboard) {
    var guid = encodeURIComponent(storyboard.viewableID);
    url += "guid=" + guid + "&";
  }

  url += "width=200&height=200";

  return url;
}

function showStoryboards(doc, mainPath) {
  var animations = Autodesk.Viewing.Document.getSubItemsWithProperties(doc.getRootItem(), {
    'type': 'folder',
    'role': 'animation'
  }, true);

  if (animations.length < 1)
    return;

  var animation = animations[0];

  var namesHtml =
    '<div class="storyboardsListItem" path="' + mainPath +
    '">Main model<br /><img class="storyboardsListItemImage" src="' +
    getImageUrl(doc) + '" /></div>';

  for (var id in animation.children) {
    var storyboard = animation.children[id];
    var path = doc.getViewablePath(storyboard);
    var imageUrl = getImageUrl(doc, storyboard);
    namesHtml += '<div class="storyboardsListItem" path="' + path + '">' + storyboard.name +
      '<br /><img class="storyboardsListItemImage" src="' + imageUrl + '" /></div>';
  }

  $('#storyboardsList').html(namesHtml);
  $('.storyboardsListItem').click(onClickStoryboard);
}

function onClickStoryboard(event) {
  var path = event.currentTarget.attributes['path'].value;
  var imageUrl = event.currentTarget.children[1].src;

  clearViewer();

  MyVars.viewer.loadModel(path, {}, onModelLoaded);

  $('#storyboardMessageText').html(
    'Take care when following the instructions in '
    + event.currentTarget.textContent);

  $('#storyboardMessageImage').attr("src", imageUrl);

  // Hide the storyboardsList
  toggleStoryboardsList();
}

function onModelLoaded(model) {
  // Orbit, Pan, Zoom, Explode Model, Settings, Full-screen
  var allowedButtons = [
    'toolbar-orbitTools',
    'toolbar-panTool',
    'toolbar-zoomTool',
    'toolbar-explodeTool',
    'toolbar-settingsTool',
    'toolbar-fullscreenTool',
    'toolbar-animationPlay'
  ];

  var toolbar = MyVars.viewer.getToolbar();
  var controlNum = toolbar.getNumberOfControls();
  for (var id = 0; id < controlNum; id++) {
    var controlId = toolbar.getControlId(id);
    var control = toolbar.getControl(controlId);

    var subControlNum = control.getNumberOfControls()
    for (var subId = 0; subId < subControlNum; subId) {
      var subControlId = control.getControlId(subId);

      // If this control is not listed as allowed, then remove it
      if (allowedButtons.indexOf(subControlId) === -1) {
        control.removeControl(subControlId);
        subControlNum--
      } else {
        subId++
      }
    }
  }
}

function loadDocument(viewer, documentId) {
  // Set the Environment to "Riverbank"
  viewer.setLightPreset(8);

  // Make sure that the loaded document's setting won't
  // override it and change it to something else
  viewer.prefs.tag('ignore-producer');

  Autodesk.Viewing.Document.load(
    documentId,
    // onLoad
    function (doc) {
      var geometryItems = [];
      // Try 3d geometry first
      geometryItems = Autodesk.Viewing.Document.getSubItemsWithProperties(doc.getRootItem(), {
        'type': 'geometry',
        'role': '3d'
      }, true);

      // If no 3d then try 2d
      if (geometryItems.length < 1)
        geometryItems = Autodesk.Viewing.Document.getSubItemsWithProperties(doc.getRootItem(), {
          'type': 'geometry',
          'role': '2d'
        }, true);

      if (geometryItems.length > 0) {
        var path = doc.getViewablePath(geometryItems[0]);
        var options = {};
        viewer.loadModel(path, options, onModelLoaded);
        showStoryboards(doc, path);
      }
    },
    // onError
    function (errorMsg) {
      //showThumbnail(documentId.substr(4, documentId.length - 1));
    }
  )
}

function showProgress() {

}




