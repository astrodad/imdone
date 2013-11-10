define([
  'underscore',
  'jquery',
  'backbone',
  'handlebars',
  'json2',
  'socketio',
  'marked',
  'prism',
  'store',
  '/js/models/search.js',
  'ace',
  'jqueryui',
  'bootstrap',
  'printElement',
  'pnotify',
  'hotkeys',
  'toc',
  'scrollTo'
], function(_, $, Backbone, Handlebars, JSON, io, marked, Prism, store, Search) {
  ace = window.ace;
  
  var imdone = window.imdone = {
    data:{},
    board:           $("#board"),
    listsMenu:       $("#lists-menu"),
    projectsMenu:    $("#projects-dropdown"),
    editorEl:        $("#editor"),
    editor:          ace.edit("editor"),
    editBar:         $(".edit-bar"),
    boardBar:        $(".board-bar"),
    fileContainer:   $("#file-container"),
    preview:         $("#preview"),
    previewContainer:$("#preview-container"),
    editBtn:         $("#edit-btn"),
    previewToggle:   $("#preview-toggle"),
    previewBtn:      $("#preview-btn"),
    printBtn:        $("#print-btn"),
    filterField:     $("#filter-field"),
    searchDialog:    $("#search-dialog"),
    searchBtn:       $("#search-dialog-btn"), 
    searchForm:      $("#search-form"),
    searchField:     $("#search-field"),
    searchResults:   $("#search-results"),
    searchResultsBtn:$("#search-results-btn"),
    filename:        $('#filename'),
    fileField:       $('#file-field'),
    fileOpenBtn:     $('#file-open'),
    contentNav:      $("#content-nav"),
    closeFileBtn:    $('#close-file-btn'),
    removeFileModal: $('#remove-file-modal').modal({show:false}),
    removeFileBtn:   $('#remove-file-btn'),
    removeFileOkBtn: $('#remove-file-ok-btn'),
    removeFileName:  $('#remove-file-name'),
    closeFileModal: $('#close-file-modal').modal({show:false, keyboard:false}),
    closeFileOkBtn: $('#close-file-ok-btn'),
    closeFileCancelBtn: $('#close-file-cancel-btn'),
    modes : {
      "md":"markdown",
      "js":"javascript",
      "html":"html",
      "css":"css",
      "java":"java",
      "json":"json",
      "coffee":"coffee",
      "joe":"coffee",
      "php":"php",
      "py":"python",
      "txt":"text"
    },
    Search: Search
  };

  //pnotify options
  $.extend($.pnotify.defaults,{
      styling: 'bootstrap',
      history: false,
      addclass: 'stack-bottomright',
      stack: {"dir1": "up", "dir2": "left", "firstpos1": 25, "firstpos2": 25}
      //stack: {"dir1": "down", "dir2": "left", "push": "bottom", "firstpos1": 45, "spacing1": 25, "spacing2": 25}
  });

  //marked options
  marked.setOptions({
    gfm: true,
    tables: true,
    breaks: false,
    pedantic: false,
    sanitize: false,
    smartLists: true,
    langPrefix: 'language-',
    highlight: function(code, lang) {
      if (lang === 'js') {
        return highlighter.javascript(code);
      }
      return code;
    }
  });

  //Convert markdown to html **This could be sourced from the server to DRY it up**
  imdone.md = function(md) {
    md = md || imdone.source.src;
    var html = marked(md);
    var externalLinks = /^http/,
        mailtoLinks = /^mailto/
        taskLinks = /#([\w\-]+?):(\d+?\.{0,1}\d*?)/,
        filterLinks = /#filter\//;
    //Replace any script elements
    html = html.replace(/<script.*?>([\s\S]*?)<\/.*?script>/ig,"$1").replace(/(href=["|'].*)javascript:.*(["|'].?>)/ig,"$1#$2");
    //Make all links with http open in new tab
    //[For markdown files, find tasks links and give them a badge](#archive:30)
    //[For internal inks, take them to the page](#archive:60)
    //[Let mailto links open email client](#done:60)
    html = html.replace(/(<a.*?href=")(.*?)(".*?)>(.*?)(<\/a>)/ig, function(anchor, head, href, tail, content, end) {
      var out = html;
      //Check for mailto links
      if (externalLinks.test(href)) {
        out = head + href + tail + ' target="_blank">' + content + end;
      //Check for task links
      } else if (taskLinks.test(href)) {
        var list;
        href.replace(taskLinks, function(href, taskList, order) {
          list = taskList;
          out = href;
        });
        out = '<span class="label label-info task-label">' + list + '</span>' + head + href + tail + ' class="task-link">' + 
                      '<span class="task-content">' + content + '</span>' + end;
      //Check for filter links
      } else if (filterLinks.test(href)) {
        var filterBy = href.split("/")[1];
        out = head + href + tail + ' title="Filter by ' + filterBy + '">' + content + end;   
      //Then it must be a link to a file
      } else if (mailtoLinks.test(href) || mailtoLinks.test($('<div />').html(href).text())) {
        out = anchor;
      //Check for external links
      } else {
        out = head + '/#file?path=' + href + "&project=" + imdone.cwd() + tail + '>' + content + end;
      }

      return out;
    });
    return html;
  };
  $(".task-link").live('click', function(evt) {
    imdone.scrollToTask = $(evt.target).text();
    imdone.navigateToCurrentProject();
    evt.preventDefault();
    evt.stopPropagation();
  });
  
  //Handlebars helpers
  Handlebars.registerHelper('markDown', function(md) {
    return imdone.md(md);
  });

  Handlebars.registerHelper('highlightCode', function(text, keyword) {
    text = Handlebars.Utils.escapeExpression(text);
    var regex = new RegExp('^(.*)(' + keyword + ')(.*)$', 'i');
    var result = text.replace(regex, '<code>$1</code><code class="highlight">$2</code><code>$3</code>');

    return new Handlebars.SafeString(result);
  });

  //[Take a look at this <https://speakerdeck.com/ammeep/unsuck-your-backbone>, <http://amy.palamounta.in/2013/04/12/unsuck-your-backbone/>](#planning:10)
  //--------------------------------------Backbone Models---------------------------------------
  var Project = Backbone.Model.extend();
  var Projects = Backbone.Collection.extend({
    model:Project,
    url:"/api/projects"
  });
  
  imdone.cwd = function() {
    return imdone.data.cwd;
  };

  imdone.cwp = function() {
    return imdone.data[imdone.cwd()];
  };

  imdone.isMD = function() {
    return imdone.source.lang == "md";
  };

  imdone.moveTask = function(e, ui) {
    var taskId = ui.item.attr("data-id");
    var listId = ui.item.attr("data-list");
    var path = ui.item.attr("data-path");
    var toListId = ui.item.closest(".list").attr("id");
    var list = _.where(imdone.cwp().lists, {name:listId})[0];
    var task = _.where(list.tasks, {pathTaskId:parseInt(taskId), path:path})[0];
    var pos = ui.item.index()-1;
    var reqObj = {
      path:path,
      pathTaskId:task.pathTaskId,
      lastUpdate:task.lastUpdate,
      from:listId,
      to:toListId,
      pos:pos,
      project:imdone.data.cwd
    };

    //Now call the service and call getKanban
    $.post("/api/moveTask", reqObj,
      function(data){
        imdone.getKanban();
      }, "json");
  };

  imdone.moveList = function(e,ui) {
    var list = ui.item.attr("data-list");
    var pos = ui.item.index();
    var reqObj = {list:list,position:pos,project:imdone.data.cwd};
    //Now call the service and call getKanban
    $.post("/api/moveList", reqObj,
      function(data){
        imdone.getKanban();
      }, "json");

  }

  imdone.hideList = function(list) {
    $.post("/api/hideList", {list:list, project:imdone.cwd()},
      function(data){
        imdone.getKanban();
      }, "json");
  }

  imdone.showList = function(list) {
    $.post("/api/showList", {list:list, project:imdone.cwd()},
      function(data){
        imdone.getKanban();
      }, "json");
  }

  imdone.getKanban = function(params) {
    //Clear out all elements and event handlers
    //Load the most recent data
    var project = params && params.project || imdone.cwd();
    if (project) {
      $.get("/api/kanban" + project, function(data){
        imdone.setProjectData(project,data);
        if ((params && !params.noPaint) || params == undefined) imdone.paintKanban(data);

        if (params && params.callback && _.isFunction(params.callback)) params.callback(data);
      }, "json");
    }
  };

  imdone.search = function(params) {
    var project = params && params.project || imdone.cwd();
    if (project) {
      var search = new imdone.Search({
        id:project,
        query:params.query, 
        offset:parseInt(params.offset), 
        limit:(params.limit)?parseInt(params.limit):undefined
      });
      search.fetch({success: function(model, response)  {
          // [Put search in a view.  [What is a view? - Backbone.js Tutorials](http://backbonetutorials.com/what-is-a-view/)](#planning:120)
          var template = Handlebars.compile($("#search-results-template").html());
          var results = model.toJSON();
          var last = results.total+results.offset;
          var context = {project:project,results:results,last:last};
          project = encodeURIComponent(project);
          if (results.offset > 0) {
            var offset = results.offset - results.opts.limit;
            context.previous = "#search/" + project + 
                               "-" + results.query +
                               "-" + offset;
          }

          if (results.filesNotSearched > 0) {
            context.next = "#search/" + project + 
                               "-" + results.query +
                               "-" + last;
          }
          imdone.searchResults.html(template(context));
          imdone.showSearchResults();
          if (params && params.callback && _.isFunction(params.callback)) params.callback(data);

        }
      });
    }
  };

  imdone.showSearchResults = function() {
    imdone.hideAllContent();
    imdone.searchResults.show();
    imdone.searchResultsBtn.show()
                           .addClass("active")
                           .attr("title", "Hide search results");
  };

  imdone.hideSearchResults = function(show) {
    imdone.searchResults.hide();
    imdone.searchResultsBtn.removeClass("active");

    if (show) {
      if (imdone.editMode) {
        imdone.showEditor();
      } else {
        imdone.paintKanban(imdone.cwp());
        imdone.showBoard();
      }
    }

    imdone.searchResultsBtn.removeClass("active")
                           .attr("title", "Show search results");
  };

  imdone.isSearchResultsVisible = function() {
    return imdone.searchResults.is(":visible");
  }

  imdone.showBoard = function() {
    imdone.boardBar.show();
    imdone.board.show();
  };

  imdone.hideBoard = function() {
    imdone.boardBar.hide();
    imdone.board.hide();
  };

  imdone.setProjectData = function(project, data) {
    imdone.data[project] = data;
    imdone.data.cwd = project;

  };

  imdone.paintKanban = function(data) {
    if (!data.processing && !imdone.editMode) {
      imdone.board.empty();
      imdone.contentNav.hide();
      imdone.listsMenu.empty();
      var template = Handlebars.compile($("#list-template").html());
      imdone.board.html(template(data));
      template =  Handlebars.compile($("#lists-template").html());
      imdone.listsMenu.html(template(data));
      //Apply existing filter
      imdone.filter();

      $( ".list" ).sortable({
            items: ".task",
            connectWith: ".list",
            stop: imdone.moveTask
        }).disableSelection();

      imdone.listsMenu.sortable({
            axis: "y",
            handle:".js-drag-handle",
            stop: imdone.moveList
      }).disableSelection();

      //Set width of board based on number of visible lists
      var totalLists  = _.reject(data.lists,function(list) {
        return list.hidden;
      }).length;
      var width = 362*totalLists;
      imdone.board.css('width',width + 'px');
      imdone.boardBar.show();

      if (!imdone.isSearchResultsVisible()) imdone.board.show();
            
      $('.list-name-container, .list-hide, .list-show').tooltip({placement:"bottom"});

      if (imdone.readmeNotify) imdone.readmeNotify.pnotify_remove();
      if (data.readme) {
        var href = "#file?project=" + imdone.cwd() + "&path=" + data.readme + "&preview=true";
        imdone.readmeNotify = $.pnotify({
          title: '<a href="' + href + '">README</a>',
          nonblock: false,
          hide: false,
          sticker: true,
          icon: "icon-book",
          type: 'info'
        });
      }

      if (imdone.scrollToTask) {
        var task = $('.task:contains("' + imdone.scrollToTask + '")');
        if (task.length > 0) {
          $('.app-container').scrollTo(task, function() {
            delete imdone.scrollToTask;
          });
        } else delete imdone.scrollToTask;
      }
    }
  };

  imdone.getProjects = function(callback) {
    $.get("/api/projects", function(data){
      imdone.projects = data;
      imdone.data.cwd = imdone.projects[0];
      imdone.paintProjectsMenu();
      if (_.isFunction(callback)) callback();
    }, "json");
  };

  imdone.paintProjectsMenu = function() {
    imdone.projectsMenu.empty();
    var template = Handlebars.compile($("#projects-template").html());
    var context = {
      cwd:imdone.data.cwd,
      projects:_.without(imdone.projects, imdone.data.cwd)
    }
    imdone.projectsMenu.html(template(context));
  };

  imdone.initUpdate = function() {
    var socket = io.connect('http://' + window.document.location.host);
    socket.on('last-update', function (data) {
      var obj = data;
      var lastUpdate = _.where(obj, {project:imdone.cwd()})[0].lastUpdate; 
      //First check if new projects were added
      if (imdone.projects.length < obj.length) {
        imdone.projects = _.pluck(obj,"project");
        imdone.paintProjectsMenu();
      }

      if (imdone && imdone.data && (imdone.cwp() == undefined || 
          (imdone.cwp().lastUpdate && (new Date(lastUpdate) > new Date(imdone.cwp().lastUpdate))))) {
        console.log("we need a refresh...");
        imdone.getKanban({project:imdone.cwd(), noPaint:true});
      }
    });
    imdone.initialized = true;
  };

  imdone.getHistory = function() {
    var projectHist;
    var hist = store.get('history');
    if (hist && hist[imdone.cwd()]) {
      projectHist = hist[imdone.cwd()];
      projectHist.reverse();
    }

    return projectHist;
  };

  imdone.addHistory = function() {
    var projectHist;
    var hist = store.get('history');
    if (!hist) hist = {};

    if (!hist[imdone.cwd()]) hist[imdone.cwd()] = [];

    //remove other occurences of path
    hist[imdone.cwd()] = _.without(hist[imdone.cwd()], imdone.source.path);
    projectHist = hist[imdone.cwd()];
    projectHist.push(imdone.source.path);
    //[Don't pop, shift](#archive:80)
    if (projectHist.length > 10) projectHist.shift();
    store.set('history', hist);
    projectHist.reverse();

    return projectHist;
  };
  
  imdone.getSource = function(params) {
    //[We have to convert the source api url URL first](#archive:190)
    if (params && params.path) params.path = params.path.replace(/^\/*/,'');
    
    var url = "/api/source" + params.project + "?path=" + params.path;
    if (params.line) url += "&line=" + params.line;
    if (params.preview) imdone.previewMode = true;
    
    //Get the source and show the editor
    $.get(url, function(data){
      imdone.source = data;
      imdone.data.cwd = data.project;
      //store the path in history
      imdone.addHistory();

      //Make sure we have the right project displayed
      imdone.paintProjectsMenu();
      
      //[Update file-path on edit button](#archive:70)
      imdone.filename.empty().html(imdone.source.path);
      imdone.contentNav.show();
      imdone.editMode = true;
      
      if (imdone.isMD()) {
        imdone.previewToggle.show();
      } else {
        imdone.previewToggle.hide();
      }      

      imdone.hideAllContent();
      imdone.hideBoard();

      if (imdone.previewMode == true && imdone.isMD()) {
          imdone.showPreview();
      } else {
          imdone.showEditor();
      }

    }, "json");
  };

  imdone.showFileView = function() {
    imdone.contentNav.show();
    imdone.editBar.show();
  };
  
  imdone.filter = function(filter) {
    $(".task").show();

    if (filter) this.filterField.val(filter);
    filter = this.filterField.val();
    
    if (filter != "") $('.task:not([data-path*="' + filter + '"])').hide();          
  };

  imdone.clearFilter = function() {
    $(".task").show();
    this.filterField.val("");
  };
  
  imdone.parseQueryString = function(queryString) {
      var params = {};
      if(queryString){
          _.each(
              _.map(decodeURI(queryString).split(/&/g),function(el,i){
                  var aux = el.split('='), o = {};
                  if(aux.length >= 1){
                      var val = undefined;
                      if(aux.length == 2)
                          val = aux[1];
                      o[aux[0]] = val;
                  }
                  return o;
              }),
              function(o){
                  _.extend(params,o);
              }
          );
      }
      return params;
  };

  //print
  imdone.print = function() {
    var printOptions = {
      pageTitle: imdone.source.path,
      overrideElementCSS:['/css/print-element.css']
    };
    if(imdone.previewMode && imdone.source.lang == "md") {
      imdone.preview.printElement(printOptions);
    } else if (imdone.editMode) {
      $("<pre><code>" + imdone.editor.getValue() + "</code></pre>").printElement(printOptions);
    } else {
      imdone.board.printElement(printOptions);
    }
  }
  imdone.printBtn.live("click", imdone.print);

  //Show the editor
  imdone.showEditor = function() {
    imdone.previewMode = false;
    imdone.editBtn.addClass("active");
    imdone.previewBtn.removeClass("active");
    var data = imdone.source,
        lang = data.lang || "txt",
        mode = imdone.modes[data.lang] || "text";

    var line = data.line || 1;
    
    var session = ace.createEditSession(data.src);
    session.setMode("ace/mode/" + mode);
    session.setUseWrapMode(true);

    //Editor change events
    session.on('change', function(e) {
      if (imdone.source.src != imdone.editor.getValue()) {
        if (!imdone.fileModified) {
          if (imdone.fileNotify) imdone.fileNotify.pnotify_remove();
          
          imdone.fileModified = true;
          imdone.fileModifiedNotify = $.pnotify({
            title: "File modified!",
            nonblock: true,
            hide: false,
            sticker: false,
            type: 'warning'
          });                    
        }
      } else {
        imdone.fileModified = false;
        imdone.fileModifiedNotify.pnotify_remove();
      }
    });

    imdone.editor.setSession(session);

    imdone.hideAllContent();
    imdone.showFileView();
    imdone.editorEl.show();
    imdone.fileContainer.show({
        duration: 0,
        complete: function() {
            imdone.editor.resize(true);
            imdone.editor.gotoLine(line);
            imdone.editor.focus();
        }
    });
  }
  imdone.editBtn.live("click", imdone.showEditor);

  imdone.hideAllContent = function() {
    imdone.previewContainer.hide();
    imdone.fileContainer.hide();
    imdone.hideSearchResults();
    imdone.board.hide();
  };

  //Show the markdown preview
  imdone.showPreview = function() {
    if (imdone.isMD()) {
      imdone.previewMode = true;
      imdone.showFileView();
      imdone.previewBtn.addClass("active");
      imdone.editBtn.removeClass("active");
      imdone.editor.blur();
      imdone.hideAllContent();
      imdone.editorEl.hide();
      imdone.preview.empty();
      imdone.preview.html(imdone.md());
      imdone.fileContainer.show();
      imdone.previewContainer.show();
      imdone.fileContainer.focus();
      Prism.highlightAll();
      $("#toc").html('').toc({
        'content':'#preview',
        'headings': 'h1,h2'
      });
      imdone.fileContainer.scrollspy('refresh');
    } else {
      imdone.previewMode = false;
    }
  }
  imdone.previewBtn.live("click", function() {
    imdone.closeFileConfirm(imdone.showPreview);
  });
  imdone.fileContainer.scrollspy({ target: '#sidebar'});

  //[User should be notified when a file has been modified](#archive:10)
  imdone.closeFile = function() {
      imdone.editMode = false;
      imdone.fileModified = false;
      imdone.previewMode = false;
      $.pnotify_remove_all();
      imdone.fileContainer.hide();
      imdone.editBar.hide();
  };

  imdone.closeFileConfirm = function(cb) {
    imdone.closeFileOkBtn.unbind('click');
    imdone.closeFileCancelBtn.unbind('click');

    if (!imdone.fileModified) {
      cb();
    } else {
      imdone.closeFileCancelBtn.click(function(e) {
        imdone.closeFileModal.modal("hide");
        imdone.fileModified = false;
        imdone.fileModifiedNotify.pnotify_remove();
        cb();
        return false;
      });
      imdone.closeFileOkBtn.click(function(e) {
        imdone.saveFile();
        imdone.closeFileModal.modal("hide");
        cb();
        return false;
      });

      imdone.closeFileModal.modal("show");
    } 
  };

  imdone.closeFileModal.on('shown.bs.modal', function() {
    imdone.closeFileOkBtn.focus();
  });
  
  //Save source from editor
  imdone.saveFile = function(evt) {
    if (imdone.fileContainer.is(":visible")) {
      imdone.source.src = imdone.editor.getValue();
      $.ajax({
          url: "/api/source" + imdone.source.project,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify(imdone.source),
          dataType: 'json',
          success: function(data) {
            if (imdone.fileModified) {
              imdone.fileModified = false;
              imdone.fileModifiedNotify.pnotify_remove();
            }
            imdone.fileNotify = $.pnotify({
              title: "File saved!",
              nonblock: true,
              hide: true,
              sticker: false,
              type: 'success'
            });

          }
      });
    }

    return true;
  }
  $('#save-file-btn').live('click', imdone.saveFile);

  imdone.removeSourceConfirm = function() {
    imdone.removeFileName.html(imdone.source.path);
    imdone.removeFileModal.modal("show");
  };
  
  imdone.removeSource = function() {
    $.ajax({
        url: "/api/source" + imdone.source.project + "?path=" + imdone.source.path,
        type: 'DELETE',
        contentType: 'application/json',
        dataType: 'json',
        success: function(data) {
          imdone.closeFile();
          imdone.getKanban({callback:function() {
            imdone.fileNotify = $.pnotify({
              title: "File deleted!",
              nonblock: true,
              hide: true,
              sticker: false,
              type: 'success'
            });
          }});
        },
        error: function(data) {
          imdone.fileNotify = $.pnotify({
            title: "Unable to delete file!",
            nonblock: true,
            hide: true,
            sticker: false,
            type: 'error'
          });
        },
    });
  };
  //[Implement delete file functionality](#done:110)
  imdone.removeFileBtn.live('click', function() {
    imdone.removeSourceConfirm();
  });

  imdone.removeFileOkBtn.live('click', function() {
    imdone.removeFileModal.modal("hide");
    imdone.removeSource();
    return false;
  });


  imdone.init = function() {
      var nameFld = $('#list-name-field');
      var nameModal = $('#list-name-modal').modal({show:false});

      //Put the focus on the name field when changing list names
      nameModal.on('shown', function() {
        nameFld.focus();
      });    

      //listen for list name click
      $('.list-name-container').live('click', function() {
        var name = $(this).attr("data-list");
        nameModal.modal('show');
        nameFld.val(name);
        nameFld.attr('placeholder', name);
      });
      
      //Save a list name
      $("#list-name-save").click(function() {
        var req = {
          name: nameFld.attr('placeholder'),
          newName:  nameFld.val(),
          project: imdone.cwd()
        };
        if (req.newName != "") {
          $.post("/api/renameList", req,
            function(data){
              imdone.getKanban();
          }, "json");
        }

        $(this).closest(".modal").modal('hide');
      });

      //Remove a list
      $(".remove-list").live("click", function() {
        var req = {
          list: $(this).attr("data-list"),
          project: imdone.cwd()
        };

        $.post("/api/removeList", req,
          function(data){
            imdone.getKanban();
        }, "json");
      });

      //Editor config
      imdone.editor.setOption("spellcheck", true);
      imdone.editor.setTheme("ace/theme/merbivore_soft");
      imdone.editor.setHighlightActiveLine(true);
      imdone.editor.setPrintMarginColumn(120);
      //[Use Vim keyboard bindings](#planning:220)
      //imdone.editor.setKeyboardHandler(require("ace/keybinding-vim").Vim);
      
      //Ace keyboard handlers
      imdone.editor.commands.addCommand({
        name: 'saveFile',
        bindKey: {win: 'Ctrl-Shift-S',  mac: 'Command-Shift-S'},
        exec: function(editor) {
            imdone.saveFile();
            return false;
        },
        readOnly: false // false if this command should not apply in readOnly mode
      });

      imdone.editor.commands.addCommand({
        name: 'removeSource',
        bindKey: {win: 'Ctrl-Shift-X',  mac: 'Command-Shift-X'},
        exec: function(editor) {
            imdone.removeSourceConfirm();
            return false;
        },
        readOnly: false // false if this command should not apply in readOnly mode
      });

      imdone.editor.commands.addCommand({
        name: 'closeFile',
        bindKey: {win: 'Esc',  mac: 'Esc'},
        exec: function(editor) {
          imdone.closeFileConfirm(function() {
            if (imdone.isMD()) {
              imdone.showPreview();
            } else {
              imdone.navigateToCurrentProject();
            }
          });
          return false;
        },
        readOnly: false // false if this command should not apply in readOnly mode
      });
      
      // keyboard handlers --------------------------------------------------------------------------------------------
      // edit
      $(window).bind('keydown', 'I', function(e){
        if (imdone.previewMode && imdone.editMode) imdone.showEditor();

        e.preventDefault();
        e.stopPropagation();
        return false;
        
      }).bind('keydown', 'esc', function(e){
        var boardMode = !(imdone.previewMode && imdone.editMode);
        if (boardMode) {
          imdone.clearFilter();
        }
        imdone.navigateToCurrentProject();
        e.preventDefault();
        e.stopPropagation();
        return false;
      // close file
      }).bind('keydown', 'Ctrl+Shift+X', function(e) {
        if (imdone.editMode) {
          imdone.removeSource();
        }
        e.preventDefault();
        e.stopPropagation();
        return false;
      // search
      }).bind('keydown', 'Ctrl+Shift+F', function(e) {
        imdone.searchBtn.dropdown('toggle');
      });

      //Get the file source for a task
      $('.source-link').live("click", function(e) {
        var list = $(this).attr("data-list");
        var taskHtml =  $(this).closest(".task").find('.task-text').html();

        //[Show the current task as notification with <http://pinesframework.org/pnotify/>](#archive:140)
        $.pnotify({
          title: list,
          text: taskHtml,
          nonblock: true,
          hide: false,
          sticker: false,
          icon: 'icon-tasks',
          type: 'info'
        });
      });

      //close the source
      imdone.closeFileBtn.live('click', function(e) {
        imdone.closeFileConfirm(function() {
          imdone.navigateToCurrentProject();
        });
        e.preventDefault();
        return false;
      });

      //Open or create a file
      var lsTemplate = Handlebars.compile($("#ls-template").html());
      $('#open-file-btn').live('click',function() {
        $.get("/api/files" + imdone.cwd(), function(data) {
          imdone.cwp().ls = data;
          imdone.cwp().cwd = data;
          data.history = imdone.getHistory();
          data.history = _.map(data.history, function(path) {
            return {path:path, project:imdone.cwd()};
          });
          $('#ls').html(lsTemplate(data));
          imdone.fileField.val("");
          $('#file-modal').modal().on('shown', function() {
            imdone.fileField.focus();
          });
        })
      });

      //Find a path in files API response node
      function findDir(path, node) {
        var dir,
            node = node || imdone.cwp().ls;
        _.each(node.dirs, function(dirNode) {
          if (dir) return;
          if (path == dirNode.path) {
            dirNode.parent = node
            dir = dirNode;
          } else if (!dir) {
            dir = findDir(path, dirNode);
          }
        });

        return dir;

      }

      //respond to directory click
      $('.js-dir').live('click', function() {
        var node = findDir($(this).attr('data-path'));
        node = node || imdone.cwp().ls;
        imdone.cwp().cwd = node;
        $('#ls').html(lsTemplate(node));
        imdone.fileField.focus();
        return false;
      });
      
      //open a file
      $('.js-file').live('click', function() {
        $(this).closest(".modal").modal('hide');
      });

      
      function openFile() {
        //[Create a new file based on path and project with call to /api/source](#archive:120)
        var path = imdone.fileField.val();
        if (path != "") {
          if (/^\//.test(path)) {
            path = path.substring(1);
          } else {
            path = imdone.cwp().cwd.path + "/" + imdone.fileField.val();
          }

          imdone.app.navigate("file?project=" + imdone.cwd() + "&path=" + path, {trigger:true});
          $(this).closest(".modal").modal('hide');
        }
        return false;
      };

      //Open a file from file-modal
      imdone.fileOpenBtn.live('click',openFile);
      imdone.fileField.bind('keydown','return', openFile);

      //close modal
      $(".modal-close").live('click', function() {
        $(this).closest(".modal").modal('hide');
        return false;        
      });

      //listen for search input
      imdone.searchForm.submit(function(event) {
        event.preventDefault();
        imdone.searchBtn.dropdown('toggle');
        var cwd = encodeURIComponent(imdone.cwd());
        var dest = "search/" + cwd + 
                   "-" + imdone.searchField.val() +
                   "-0";
        imdone.app.navigate(dest, {trigger:true});
        return false;
      });

      //listen for search button click
      imdone.searchResultsBtn.click(function() {
        if (imdone.isSearchResultsVisible()) {
          imdone.hideSearchResults(true);
        } else {
          imdone.showSearchResults();
        }
      });

      imdone.searchDialog.on("show.bs.dropdown", function() {
        imdone.searchField.val('');
        setTimeout(function() {
          imdone.searchField.focus();
        }, 500);
      });

      imdone.searchField.click(function(e) {
        e.stopPropagation();
        return false;
      });

      //listen for filter input
      //[Apply filter when kanban is reloaded](#archive:40)
      imdone.filterField.keyup(function() {
        imdone.filter();
      });

      $("#clear").click(function() {
        imdone.clearFilter();
        return false;
      });

      //Listen for hide
      $(".list-hide, .list-show").live('click', function(e) {
        var list = $(this).attr("data-list");
        var el = $("#" + list);
        if (el.length > 0) {
          imdone.hideList(list);
        } else {
          imdone.showList(list);
        }
        e.stopPropagation();
        return false;
      });

      //Get projects and start listening for updates
      imdone.getProjects(function() {
        imdone.app = new AppRouter();
        imdone.calls = 0;
        Backbone.history.on('route', function () {
          console.log(imdone.calls);
          imdone.calls++;
        });
        Backbone.history.start();
      });

      imdone.navigateToCurrentProject = function() {
        imdone.app.navigate("project" + imdone.cwd(), {trigger:true});
      };
  };

  var AppRouter = Backbone.Router.extend({
      routes: {
          //[Set up router for projects and files](#archive:50)
          "search/:project-:query-:offset(-:limit)": "searchRoute",
          "project*project": "projectRoute",
          "file?*querystring": "fileRoute",
          "filter/*filter" : "filterRoute", //[Filter route so links can change filter](#done:80)
          "*action": "defaultRoute" // Backbone will try match the route above first
        },

      initialize: function() {
        //[Construct views and models in here!](#todo:30)
        imdone.data.projects = new Projects();
      },
      
      filterRoute: function(filter) {
          imdone.filter(filter);

          if (!imdone.cwp()) {
            this.defaultRoute(filter);
          }
      },

      changeProject: function(project) {
            imdone.closeFile();
            imdone.getKanban({project:project, callback: imdone.paintProjectsMenu});
            imdone.hideSearchResults();
            $(document).attr("title", "iMDone - " + project);
      },

      projectRoute: function(project) {
        var self = this;
        if (imdone.fileModified) imdone.closeFileConfirm(function() { self.changeProject(project); });
        else self.changeProject(project);
      },

      changeFile: function(qs) {
        var params = imdone.parseQueryString(qs);
        if (!imdone.cwp()) {
          imdone.getKanban({project:params.project, noPaint:true, callback:function() {
            imdone.getSource(params);
          }});
        } else {
          //Get the source and show the editor
          imdone.getSource(params);
        }
        $(document).attr("title", "iMDone - " + params.project + "/" + params.path);
      },

      fileRoute: function(qs) {
        var self = this;
        if (imdone.fileModified) imdone.closeFileConfirm(function() { self.changeFile(qs); });
        else self.changeFile(qs);
      },

      searchRoute: function(project, query, offset, limit) {
        var params = {project:project, query:query, offset:offset, limit:limit};
        if (!imdone.cwp()) {
          imdone.getKanban({project:project, noPaint:true, callback:function() {
            imdone.paintProjectsMenu();
            imdone.search(params);
          }});
        } else {
          imdone.search(params);
        }
        $(document).attr("title", "iMDone - " + params.project + " Find: " + params.query);
      },

      defaultRoute: function() {
        if (!imdone.initialized) {
          imdone.app.navigate("project" + imdone.projects[0], {trigger:true}); 
          imdone.initUpdate();
        }
      },
  });


  return imdone;
});
