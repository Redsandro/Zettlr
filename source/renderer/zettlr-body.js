/* global $ */
/**
 * @ignore
 * BEGIN HEADER
 *
 * Contains:        ZettlrBody class
 * CVM-Role:        Model
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This is a model that represents all GUI elements that are
 *                  not controlled by one of the other Models (e.g. affect the
 *                  whole app)
 *
 * END HEADER
 */

const ZettlrCon = require('./zettlr-context.js')
const ZettlrDialog = require('./zettlr-dialog.js')
const ZettlrQuicklook = require('./zettlr-quicklook.js')
const ZettlrNotification = require('./zettlr-notification.js')
const popup = require('./zettlr-popup.js')

const { trans } = require('../common/lang/i18n.js')
const { localiseNumber } = require('../common/zettlr-helpers.js')

/**
 * This class's duty is to handle everything that affects (or can potentially
 * occur over) the whole app window, such as dialogs (preferences), Quicklook
 * windows or popups. Among the tasks of this class is to bundle these together
 * for easy access so that we always know where to put such things.
 */
class ZettlrBody {
  /**
    * Activate whatever we need
    * @param {ZettlrRenderer} parent The renderer main object
    */
  constructor (parent) {
    this._renderer = parent
    this._menu = new ZettlrCon(this)
    this._dialog = new ZettlrDialog(this)
    this._spellcheckLangs = null // This holds all available languages
    this._ql = [] // This holds all open quicklook windows
    this._n = [] // Holds all notifications currently displaying
    this._recentDocs = [] // All documents, up to twenty that have been opened on a per-session basis
    this._numRecentDocs = 10 // No more than 10 docs in the list

    // Make preview and editor resizable
    $('#editor').resizable({
      'handles': 'w',
      'resize': (e, ui) => { $('#combiner').css('width', ($(window).width() - ui.size.width) + 'px') },
      'stop': (e, ui) => {
        this._renderer.getEditor().refresh() // Refresh the editor to update lines and cursor positions.
        $('body').css('cursor', '') // Why does jQueryUI ALWAYS do this to me?
      },
      'minWidth': Math.round($(window).width() * 0.4),
      'maxWidth': Math.round($(window).width() * 0.9)
    })

    // Update resize options on window resize
    window.addEventListener('resize', (e) => {
      $('#editor').resizable('option', 'minWidth', Math.round($(window).width() * 0.4))
      $('#editor').resizable('option', 'maxWidth', Math.round($(window).width() * 0.9))

      // Also we have to resize the editor to the correct width again
      $('#editor').css('width', $(window).innerWidth() - $('#combiner').outerWidth() + 'px')
    })

    // Event listener for the context menu
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this._menu.popup(e)
    }, false)

    document.addEventListener('dragover', function (event) {
      event.preventDefault()
      return false
    }, false)

    // On drop, tell the renderer to tell main that there's something to
    // handle.
    document.addEventListener('drop', (event) => {
      event.preventDefault()
      // Retrieve all paths
      let f = []
      for (let i = 0; i < event.dataTransfer.files.length; i++) {
        f.push(event.dataTransfer.files.item(i).path)
      }
      this._renderer.handleDrop(f)
      return false
    }, false)
  }

  /**
    * Display a small popup to ask for a new file name
    * @param  {ZettlrDir} dir A directory object
    * @return {void}     Nothing to return.
    */
  requestFileName (dir) {
    if (!dir) {
      return // No directory selected.
    }

    let cnt = $('<div>').html(
      `<form action="#" method="GET">
        <input type="text" class="small" value="${trans('dialog.file_new.value')}" placeholder="${trans('dialog.file_new.placeholder')}" name="name" required>
      </form>`
    )

    popup($('.button.file-new'), cnt, (form) => {
      if (form) {
        this._renderer.requestNewFile(form[0].value, dir.hash)
      }
    })
  }

  /**
    * Display a small popup for a new directory.
    * @param  {ZettlrDir} dir The parent directory object.
    * @return {void}     Nothing to return.
    */
  requestDirName (dir) {
    if (!dir) {
      return // No directory selected.
    }

    let cnt = $('<div>').html(
      `<form action="#" method="GET">
        <input type="text" class="small" value="${trans('dialog.dir_new.value')}" placeholder="${trans('dialog.dir_new.placeholder')}" name="name" required>
      </form>`
    )

    popup($('.button.directory-new'), cnt, (form) => {
      if (form) {
        this._renderer.requestNewDir(form[0].value, dir.hash)
      }
    })
  }

  /**
    * Requests a directory name for a new virtual directory
    * @param  {ZettlrDir} dir The parent directory object.
    * @return {void}     Nothing to return.
    */
  requestVirtualDirName (dir) {
    if (!dir) {
      return // No directory selected.
    }

    let cnt = $('<div>').html(
      `<form action="#" method="GET">
        <input type="text" class="small" value="${trans('dialog.dir_new.value')}" placeholder="${trans('dialog.dir_new.placeholder')}" name="name" required>
      </form>`
    )

    popup($(`[data-hash=${dir.hash}]`), cnt, (form) => {
      if (form) {
        this._renderer.requestNewVirtualDir(form[0].value, dir.hash)
      }
    })
  }

  /**
    * Display a small popup to ask for a new dir name for an already existing.
    * @param  {ZettlrDir} dir The directory to be renamed
    * @return {void}     Nothing to return.
    */
  requestNewDirName (dir) {
    let elem = $('#directories').find('li[data-hash="' + dir.hash + '"]').first()
    let cnt = $('<div>').html(
      `<form action="#" method="GET">
        <input type="text" class="small" value="${dir.name}" placeholder="${trans('dialog.dir_rename.placeholder')}" name="name" required>
      </form>`
    )

    popup(elem, cnt, (form) => {
      if (form) {
        this._renderer.requestDirRename(form[0].value, dir.hash)
      }
    })
  }

  /**
    * Requests a new file name.
    * @param  {ZettlrFile} file The file to be renamed.
    * @return {void}      Nothing to return.
    */
  requestNewFileName (file) {
    let elem = ''
    if (this._renderer.getCurrentFile() != null && this._renderer.getCurrentFile().hash === file.hash) {
      elem = $('.button.file-rename')
    } else {
      elem = $('#preview').find('li[data-hash="' + file.hash + '"]').first()
      if (elem.length === 0) {
        // Obviously the file is standalone
        elem = $('#directories').find('div[data-hash="' + file.hash + '"]').first()
      }
    }

    let cnt = $('<div>').html(
      `<form action="#" method="GET">
        <input type="text" class="small" value="${file.name}" placeholder="${trans('dialog.file_rename.placeholder')}" name="name" required>
      </form>`
    )

    popup(elem, cnt, (form) => {
      if (form) {
        this._renderer.requestFileRename(form[0].value, file.hash)
      }
    })
  }

  /**
    * Displays file information (such as word count etc)
    * @return {ZettlrPopup} The popup that is shown.
    */
  showFileInfo () {
    let info = this._renderer.getEditor().getFileInfo()
    let cnt = `
        <table>
        <tr>
            <td style="text-align:right"><strong>${localiseNumber(info.words)}</strong></td><td>${trans('gui.file_words')}</td>
        </tr>
        <tr>
            <td style="text-align:right"><strong>${localiseNumber(info.chars)}</strong></td><td>${trans('gui.file_chars')}</td>
        </tr>
        <tr>
            <td style="text-align:right"><strong>${localiseNumber(info.chars_wo_spaces)}</strong></td><td>${trans('gui.file_chars_wo_spaces')}</td>
        </tr>`

    if (info.words_sel && info.chars_sel) {
      cnt += `
            <tr>
                <td style="text-align:right"><strong>${localiseNumber(info.words_sel)}</strong></td><td>${trans('gui.file_words_sel')}</td>
            </tr>
            <tr>
                <td style="text-align:right"><strong>${localiseNumber(info.chars_sel)}</strong></td><td>${trans('gui.file_chars_sel')}</td>
            </tr>`
    }

    cnt += `</table>`

    return popup($('#toolbar .file-info'), cnt)
  }

  /**
    * Display a popup containing the list of the most recent documents used during this session
    */
  showRecentDocuments () {
    if (this._recentDocs.length === 0) {
      return popup($('#toolbar .recent-docs'), '<p>' + trans('gui.no_recent_docs') + '</p>')
    }

    let cnt = '<div class="recent-docs">\n'
    for (let doc of this._recentDocs) {
      cnt += `<a href="#" data-hash="${doc.hash}" title="${doc.name}">${doc.name}</a>\n`
    }
    cnt += '</div>'

    let p = popup($('#toolbar .recent-docs'), cnt)

    $('.popup .recent-docs a').click((e) => {
      let hash = $(e.target).attr('data-hash')
      this._renderer.requestFile(hash)
      p.close()
    })
  }

  /**
    * Add a new document to the list of recent documents, unless it already exists
    * @param {ZettlrFile} file The file to be added
    */
  addRecentDocument (file) {
    let found = this._recentDocs.find((elem) => { return (elem.hash === file.hash) })
    if (found !== undefined) {
      this._recentDocs.splice(this._recentDocs.indexOf(found), 1)
      this._recentDocs.push(found)
      return
    }

    while (this._recentDocs.length > this._numRecentDocs - 1) {
      this._recentDocs.shift()
    }

    this._recentDocs.push({ 'hash': file.hash, 'name': file.name })
  }

  /**
    * Opens a quicklook window for a given file.
    * @param  {ZettlrFile} file The file to be loaded into the QuickLook
    * @return {void}      Nothing to return.
    */
  quicklook (file) {
    this._ql.push(new ZettlrQuicklook(this, file))
  }

  /**
    * This function is called by Quicklook windows on their destruction to
    * remove them from this array.
    * @param  {ZettlrQuicklook} zql The Quicklook that has requested its removal.
    * @return {Boolean}     True, if the call succeeded, or false.
    */
  qlsplice (zql) {
    let index = this._ql.indexOf(zql)
    if (index > -1) {
      this._ql.splice(index, 1)
      return true
    }

    return false
  }

  /**
    * Closes all quicklooks.
    * @return {ZettlrBody} Chainability.
    */
  closeQuicklook () {
    while (this._ql.length > 0) {
      // QuickLooks splice themselves from the array -> always close first
      this._ql[0].close()
    }

    return this
  }

  /**
    * Display a small notifiation.
    * @param  {String} message What should the user be notified about?
    * n {ZettlrBody}         Chainability.
    */
  notify (message) {
    this._n.push(new ZettlrNotification(this, message, this._n.length))
    return this
  }

  /**
    * Remove a notification from the array.
    * @param  {ZettlrNotification} ntf  The notification that wants itself removed.
    * @param  {Integer} oldH The old height of the notification.
    * @return {void}      Nothing to return.
    */
  notifySplice (ntf, oldH) {
    let index = this._n.indexOf(ntf)
    if (index > -1) {
      this._n.splice(index, 1)
    }

    for (let msg of this._n) {
      msg.moveUp(oldH)
    }
  }

  /**
    * Toggled the theme
    * @return {ZettlrBody} Chainability.
    */
  toggleTheme () {
    // Set the body to dark; will affect everything on the page.
    $('body').toggleClass('dark')

    return this
  }

  /**
    * Opens the exporting popup
    * @param  {ZettlrFile} file Which file should be exported?
    * @return {void}      Nothing to return.
    */
  displayExport (file) {
    // Create a popup
    let cnt = $('<div>').html(
      `
      <div class="row">
          <div class="btn-share htm" title="${trans('dialog.export.alt_html')}" data-ext="html" data-hash="${file.hash}">HTML</div>
          <div class="btn-share pdf" title="${trans('dialog.export.alt_pdf')}" data-ext="pdf" data-hash="${file.hash}">PDF</div>
          <div class="btn-share odt" title="${trans('dialog.export.alt_odt')}" data-ext="odt" data-hash="${file.hash}">ODT</div>
          <div class="btn-share docx" title="${trans('dialog.export.alt_docx')}" data-ext="docx" data-hash="${file.hash}">DOCX</div>
      </div>
      <div class="row">
          <div class="btn-share revealjs" title="reveal.js Presentation"></div>
          <div class="btn-share rst" title="reStructuredText" data-ext="rst" data-hash="${file.hash}">rST</div>
          <div class="btn-share rtf" title="Rich Text Format" data-ext="rtf" data-hash="${file.hash}">RTF</div>
          <div class="btn-share tex" title="LaTeX" data-ext="latex" data-hash="${file.hash}">TeX</div>
      </div>
      <!-- This row's visibility will be toggled by clicking the reveal.js button -->
      <div id="reveal-themes" class="hidden">
          <div class="row">
              <div class="btn-share revealjs-black" title="Black" data-ext="revealjs-black" data-hash="${file.hash}"></div>
              <div class="btn-share revealjs-moon" title="Moon" data-ext="revealjs-moon" data-hash="${file.hash}"></div>
              <div class="btn-share revealjs-league" title="League" data-ext="revealjs-league" data-hash="${file.hash}"></div>
              <div class="btn-share revealjs-sky" title="Sky" data-ext="revealjs-sky" data-hash="${file.hash}"></div>
          </div>
          <div class="row">
              <div class="btn-share revealjs-beige" title="Beige" data-ext="revealjs-beige" data-hash="${file.hash}"></div>
              <div class="btn-share revealjs-solarized" title="Solarized" data-ext="revealjs-solarized" data-hash="${file.hash}"></div>
              <div class="btn-share revealjs-serif" title="Serif" data-ext="revealjs-serif" data-hash="${file.hash}"></div>
              <div class="btn-share revealjs-white" title="White" data-ext="revealjs-white" data-hash="${file.hash}"></div>
          </div>
      </div> <!-- END #reveal-themes -->
      <div class="row">
          <div class="btn-share plain" title="Text" data-ext="plain" data-hash="${file.hash}">TXT</div>
          <div class="btn-share org" title="Emacs Org" data-ext="org" data-hash="${file.hash}">ORG</div>
          <div class="btn-share textile" title="Textile" data-ext="textile" data-hash="${file.hash}">Txtl</div>
          <div class="btn-share mediawiki" title="MediaWiki" data-ext="mediawiki" data-hash="${file.hash}">mWiki</div>
      </div>
      `
    )
    let p = popup($('.button.share'), cnt)

    $('.btn-share').click((e) => {
      // The revealjs-button doesn't trigger an export, but the visibility
      // of the themes selection
      if ($(e.target).hasClass('revealjs')) {
        $('#reveal-themes').toggleClass('hidden')
        return
      }
      this.requestExport(e.target)
      p.close()
    })
  }

  /**
    * Open a new dialog for displaying the preferences.
    * @param  {Object} prefs An object containing all current config variables
    * @return {void}       Nothing to return.
    */
  displayPreferences (prefs) {
    this._dialog.init('preferences', prefs)
    this._dialog.open()
  }

  /**
    * Open a new dialog for displaying the PDF preferences.
    * @param  {Object} prefs An object containing all current config variables
    * @return {void}       Nothing to return.
    */
  displayPDFPreferences (prefs) {
    this._dialog.init('pdf-preferences', prefs)
    this._dialog.open()
  }

  /**
    * Displays the tag preferences with the current settings.
    * @param  {Object} prefs An object containing the current tags.
    * @return {void}       Nothing to return.
    */
  displayTagsPreferences (prefs) {
    this._dialog.init('tags-preferences', prefs)
    this._dialog.open()
  }

  /**
    * Displays project properties for a given project.
    * @param  {Object} prefs The project's preferences.
    * @return {void}       Nothing to return.
    */
  displayProjectProperties (prefs) {
    this._dialog.init('project-properties', prefs)
    this._dialog.open()
  }

  /**
    * Displays the update notification
    * @param  {Object} cnt An object containing information on the update.
    */
  displayUpdate (cnt) {
    this._dialog.init('update', cnt)
    this._dialog.open()
  }

  /**
    * Displays the about dialog
    */
  displayAbout () {
    this._dialog.init('about')
    this._dialog.open()
  }

  /**
    * Displays the find-in-file popup.
    * @return {void} Nothing to return.
    */
  displayFind () {
    if (this._renderer.getCurrentFile() === null) {
      return
    }

    let cnt = `<form class="search"><input type="text" placeholder="${trans('gui.find_placeholder')}" value="" id="searchWhat"><button id="searchNext">${trans('gui.find_label')}</button><br>
        <input type="text" placeholder="${trans('gui.replace_placeholder')}" value="" id="replaceWhat"><button id="replaceNext">${trans('gui.replace_label')}</button><button id="replaceAll">${trans('gui.replace_all_label')}</button></form>`

    // This must be a persistent popup
    popup($('.button.find'), cnt, (x) => {
      // Remove search cursor once the popup is closed
      this._renderer.getEditor().stopSearch()
    }).makePersistent()

    $('#searchWhat').on('keyup', (e) => {
      if (e.which === 13) { // Enter
        e.preventDefault()
      }
    })

    $('#replaceWhat').on('keyup', (e) => {
      if (e.which === 13) { // Return
        e.preventDefault()
        if (e.altKey) {
          $('#replaceAll').click()
        } else {
          $('#replaceNext').click()
        }
      }
    })

    $('#searchNext').click((e) => {
      this._renderer.getEditor().searchNext($('#searchWhat').val())
    })

    $('#replaceNext').click((e) => {
      this._renderer.getEditor().replaceNext($('#replaceWhat').val())
      // Immediately highlight the next search result
      this._renderer.getEditor().searchNext($('#searchWhat').val())
    })

    $('#replaceAll').click((e) => {
      this._renderer.getEditor().replaceAll($('#searchWhat').val(), $('#replaceWhat').val())
    })
  }

  /**
    * Displays a popup containing all formattings
    */
  displayFormatting () {
    let cnt = `
        <div class="formatting">
        <a href="#" class="markdownHeading1" id="header-formatting">
        <span class="markdownHeading1">#</span>
        <span class="markdownHeading2">#</span>
        <span class="markdownHeading3">#</span>
        <span class="markdownHeading4">#</span>
        <span class="markdownHeading5">#</span>
        <span class="markdownHeading6">#</span>
        </a>
        <hr>
        <a href="#" class="markdownBold">${trans('gui.formatting.bold')}</a>
        <a href="#" class="markdownItalic">${trans('gui.formatting.italic')}</a>
        <a href="#" class="markdownCode">${trans('gui.formatting.code')}</a>
        <hr>
        <a href="#" class="markdownLink">${trans('gui.formatting.link')}</a>
        <a href="#" class="markdownImage">${trans('gui.formatting.image')}</a>
        <hr>
        <a href="#" class="markdownBlockquote">${trans('gui.formatting.blockquote')}</a>
        <a href="#" class="markdownMakeOrderedList">${trans('gui.formatting.ol')}</a>
        <a href="#" class="markdownMakeUnorderedList">${trans('gui.formatting.ul')}</a>
        <hr>
        <a href="#" class="markdownDivider">${trans('gui.formatting.divider')}</a>
        <hr>
        <a href="#" class="insertFootnote">${trans('gui.formatting.footnote')}</a>
        <a href="#" class="removeFootnote">${trans('gui.formatting.remove_footnote')}</a>
        </div>`
    let p = popup($('.button.formatting'), cnt)

    $('.formatting #header-formatting').on('mousemove', (e) => {
      let elem = $(e.target)
      $('.formatting span').removeClass('active')
      if (!elem.is('span')) {
        $('.formatting #header-formatting').prop('class', 'markdownHeading1')
        return
      }
      // Nice little effect
      switch (e.target.className) {
        case 'markdownHeading6':
          $('.formatting .markdownHeading6').addClass('active')
          // fall through
        case 'markdownHeading5':
          $('.formatting .markdownHeading5').addClass('active')
          // fall through
        case 'markdownHeading4':
          $('.formatting .markdownHeading4').addClass('active')
          // fall through
        case 'markdownHeading3':
          $('.formatting .markdownHeading3').addClass('active')
          // fall through
        case 'markdownHeading2':
          $('.formatting .markdownHeading2').addClass('active')
          // fall through
        case 'markdownHeading1':
          $('.formatting .markdownHeading1').addClass('active')
      }
      $('.formatting #header-formatting').prop('class', e.target.className)
    })

    $('.formatting a').click((e) => {
      $('.formatting span').removeClass('active')
      this._renderer.handleEvent('cm-command', e.target.className)
      p.close()
    })
  }

  /**
    * Requests the export of a file. Is called by the exporting buttons.
    * @param  {jQuery} elem A jQuery object representing the clicked button.
    * @return {void}      Nothing to return.
    */
  requestExport (elem) {
    // The element contains data-attributes containing all necessary
    // data for export.
    let ext = $(elem).attr('data-ext')
    let hash = $(elem).attr('data-hash')
    this._renderer.requestExport(hash, ext)
  }

  /**
    * Simply set the spellchecking languages. Needed for the preferences.
    * @param {array} langs An array containing all supported languages.
    */
  setSpellcheckLangs (langs) {
    this._spellcheckLangs = {}
    for (let l in langs) {
      // Default to false, will only be overwritten if a language is checked
      this._spellcheckLangs[l] = false
    }
  }

  // This function gets only called by the dialog class with an array
  // containing all serialized form inputs and the dialog type
  /**
    * This function is called by the dialog class when the user saves settings.
    * @param  {String} dialog    The opened dialog.
    * @param  {Array} res       An array containing all settings
    * @return {void}           Nothing to return.
    */
  proceed (dialog, res) {
    let pandoc = ''
    let xelatex = ''
    let darkTheme = false
    let snippets = false
    let selectedDicts = []
    let appLang = 'en_US'
    let debug = false
    let attachments = []
    let exportDir = 'temp'
    let stripIDs = false
    let stripTags = false
    let stripLinks = 'full'
    let author = ''
    let keywords = ''
    let lmargin = 0
    let rmargin = 0
    let bmargin = 0
    let tmargin = 0
    let fontsize = 12
    let papertype = 'a4paper'
    let lineheight = 1
    let mainfont = 'Times New Roman'
    let marginUnit = 'cm'
    let pagenumbering = 'gobble'
    let mute = false
    let combinerState = 'collapsed'
    let tags = { 'name': [], 'color': [], 'desc': [] }
    let projectTitle = ''
    let hash = ''
    let toc = false
    let tocDepth = 0
    let titlepage = false
    let zkn = { 'idRE': '', 'linkStart': '', 'linkEnd': '', 'idGen': '' }

    for (let r of res) {
      switch (r.name) {
        case 'pref-pandoc':
          pandoc = r.value
          break
        case 'pref-xelatex':
          xelatex = r.value
          break
        case 'pref-darkTheme':
          darkTheme = true
          break
        case 'pref-snippets':
          snippets = true
          break
        case 'pref-combiner-state':
          combinerState = r.value
          break
        case 'pref-mute-lines':
          mute = true
          break
        case 'spellcheck[]':
          selectedDicts.push(r.value)
          break
        case 'app-lang':
          appLang = r.value
          break
        case 'debug':
          debug = true
          break
        case 'pref-export-dest':
          exportDir = r.value
          break
        case 'pref-export-strip-id':
          stripIDs = true
          break
        case 'pref-export-strip-tags':
          stripTags = true
          break
        case 'pref-export-strip-links':
          stripLinks = r.value
          break
        case 'pref-attachments':
          // We have to account for user jokes
          attachments = r.value.split(',')
          for (let i = 0; i < attachments.length; i++) {
            attachments[i] = attachments[i].trim().replace(/[\s]/g, '')
            if (attachments[i].length < 2) {
              attachments.splice(i, 1)
              i--
              continue
            }
            if (attachments[i].charAt(0) !== '.') {
              attachments[i] = '.' + attachments[i]
            }
          }
          break
        case 'prefs-pdf-author':
          author = r.value
          break
        case 'prefs-pdf-keywords':
          keywords = r.value
          break
        case 'prefs-pdf-papertype':
          papertype = r.value
          break
        case 'prefs-pdf-margin-unit':
          marginUnit = r.value
          break
        case 'prefs-pdf-tmargin':
          tmargin = r.value || 0
          break
        case 'prefs-pdf-bmargin':
          bmargin = r.value || 0
          break
        case 'prefs-pdf-lmargin':
          lmargin = r.value || 0
          break
        case 'prefs-pdf-rmargin':
          rmargin = r.value || 0
          break
        case 'prefs-pdf-mainfont':
          mainfont = r.value
          break
        case 'prefs-pdf-fontsize':
          fontsize = parseInt(r.value)
          break
        case 'prefs-pdf-lineheight':
          lineheight = r.value / 100 // Convert to floating point scale
          break
        case 'prefs-pdf-pagenumbering':
          pagenumbering = r.value
          break
        case 'prefs-tags-name':
          tags.name.push((r.value[0] === '#') ? r.value.substr(1).toLowerCase() : r.value.toLowerCase())
          break
        case 'prefs-tags-color':
          tags.color.push(r.value)
          break
        case 'prefs-tags-desc':
          tags.desc.push(r.value)
          break
        case 'prefs-project-title':
          projectTitle = r.value
          break
        case 'prefs-project-hash':
          hash = parseInt(r.value)
          break
        case 'prefs-pdf-toc':
          toc = true
          break
        case 'prefs-pdf-toc-depth':
          tocDepth = parseInt(r.value)
          break
        case 'prefs-pdf-titlepage':
          titlepage = true
          break
        case 'pref-zkn-id-regex':
          zkn.idRE = r.value
          break
        case 'pref-zkn-linkstart-regex':
          zkn.linkStart = r.value
          break
        case 'pref-zkn-linkend-regex':
          zkn.linkEnd = r.value
          break
        case 'pref-zkn-id-generator':
          zkn.idGen = r.value
          break
      }
    }

    // Build the config object and send it to main
    let cfg = {}
    if (dialog === 'preferences') {
      cfg = {
        'pandoc': pandoc,
        'xelatex': xelatex,
        'darkTheme': darkTheme,
        'snippets': snippets,
        'combinerState': combinerState,
        'muteLines': mute,
        'selectedDicts': selectedDicts,
        'app_lang': appLang,
        'debug': debug,
        'export': {
          'dir': exportDir,
          'stripIDs': stripIDs,
          'stripTags': stripTags,
          'stripLinks': stripLinks
        },
        'zkn': zkn,
        'attachmentExtensions': attachments
      }
      this._renderer.saveSettings(cfg)
      this._dialog.close()
    } else if (dialog === 'pdf-preferences' || dialog === 'project-properties') {
      cfg = {
        'pdf': {
          'author': author,
          'keywords': keywords,
          'papertype': papertype,
          'pagenumbering': pagenumbering,
          'tmargin': tmargin,
          'rmargin': rmargin,
          'bmargin': bmargin,
          'lmargin': lmargin,
          'margin_unit': marginUnit,
          'lineheight': lineheight,
          'mainfont': mainfont,
          'fontsize': fontsize,
          'toc': toc,
          'tocDepth': tocDepth,
          'titlepage': titlepage
        }
      }
      // Add additional properties for the project settings.
      if (dialog === 'project-properties') {
        cfg.title = projectTitle

        // Convert to correct object
        let obj = {}
        obj.properties = cfg
        obj.hash = hash
        this._renderer.saveProjectSettings(obj)
      } else {
        // pdf preferences
        this._renderer.saveSettings(cfg)
      }
      this._dialog.close()
    } else if (dialog === 'tags-preferences') {
      let t = []
      for (let i = 0; i < tags.name.length; i++) {
        t.push({ 'name': tags.name[i], 'color': tags.color[i], 'desc': tags.desc[i] })
      }
      this._renderer.saveTags(t)
      this._dialog.close()
    }
  }

  /**
    * Needed by the dialog
    * @return {String} The locale String from ZettlrRenderer
    */
  getLocale () { return this._renderer.getLocale() }

  /**
    * Returns the renderer
    * @return {ZettlrRenderer} The renderer object
    */
  getRenderer () { return this._renderer }
}

module.exports = ZettlrBody
