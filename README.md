

	  _   __  __   _____                         
	 (_) |  \/  | |  __ \                        
	  _  | \  / | | |  | |   ___    _ __     ___ 
	 | | | |\/| | | |  | |  / _ \  | '_ \   / _ \
	 | | | |  | | | |__| | | (_) | | | | | |  __/
	 |_| |_|  |_| |_____/   \___/  |_| |_|  \___|

Keep your tasks in your work!!!
----
Create tasks in any file using markdown syntax and organize them with a local kanban board.  Your tasks are in your files, so you can share your board on [github](http://www.github.com), [dropbox](http://www.dropbox.com), or any other cloud storage provider.

Tasks are just markdown links!!!
----

**Put a task at the top of a list called "todo"**  
   `[this is a task](#todo:10)`  

**In javascript code**  
   `//[this is a task in javascript code](#todo:0)`  

**Put a task on the bottom of a list called "doing" (giving it a sort value of 1000 will put it at the bottom unless you have tons of tasks in the list)**  
   `[this is a task in doing](#todo:20)`  

**Tasks are sorted by the number after the `:`**

More
----
- **Edit and create files directly in iMDone using the [Ace editor](http://ace.ajax.org)!**
- **Preview markdown files and print them as markdown or html!**


Prerequisites 
----
- [nodejs](http://nodejs.org/) is [installed](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager)
- [npm](https://npmjs.org/) is [installed](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager)


Install
----
   `npm install -g imdone`

Run
----
- open a terminal window and navigate to your local project folder and run:  
   `imdone -o`

- You can start it in multiple directories and switch between projects in the UI

- Here's the help output

	  Usage: imdone [options]

	  Options:

	    -h, --help                output usage information
	    -V, --version             output the version number
	    -o, --open                Open imdone in the default browser
	    -s, --stop                Stop imdone server
	    -d, --dirs <directories>  A comma separated list of project directories

	  Examples:

	    Open imdone in a browser with the current working directory as the project root

	    $ imdone -o

	    Open imdone in a browser with list of project directories

	    $ imdone -o -d projects/imdone,projects/myproject

How you can help
----
If you like iMDone and want to help me make it better, you can make a contribution at pledgie.  Every donation is very much appreciated.  

<a href='http://www.pledgie.com/campaigns/19536'><img alt='Click here to lend your support to: iMDone - TODO, doing, done! and make a donation at www.pledgie.com !' src='http://www.pledgie.com/campaigns/19536.png?skin_name=chrome' border='0' /></a>

If you have some spare time, then there is no better way to help an open source project than to get involved in one of the following ways.

- Help diagnose and report problems
- Suggest fixes by sending in patches
- Improve the code
- Help with unit and end-to-end testing
- Provide peer support on our forum
- Publish an article on your blog (send the link) to educate others regarding some aspect of the project
- Help with missing documentation

See it in action!
----
fork this repository and run imdone in your local copy.  I use imdone for keep track of development of imdone

**imdone will create a directory named imdone that will contain your custom configuration and a file to keep your lists in order**  
- you should keep the imdone directory in source control  
  
**Filter by file name**  
- You can filter by the file name the task are in.  
- As you type in the "filter by file name" field, tasks are filtered
  
Configuration
----
After running imdone for the first time, modify imdone/imdone.js in your project directory.  The default config looks like this.  Your imdone.js will extend this.
  
	module.exports = {
		include:/^.*$/,
		exclude:/^(node_modules|imdone|target)\/|\.(git|svn)\/|\~$|\.(jpg|png|gif|swp)$/,
		marked : {
			gfm: true,
			pedantic: false,
			sanitize: true
		}
	};

Disclaimer
----
iMDone has only been tested on my Ubuntu 12.04 desktop using chrome 23.0.x as the default browser.  It should work on any machine that has nodejs and npm installed and for auto update of boards, a browser that supports websockets.

Roadmap
----

- [User should be able to easily access recently edited files](#archive:130)
- [Show file explorer when editing files](#todo:50)
- [Enable svn and git commit after file changes](#todo:10)
- [Convert front end to use backbone.js](#todo:70)
- [respect marked configuration in client javascript](#todo:0)
- [User should be able to use TOC in preview mode for md files](doing:0)
- [User should be able to quickly add a date and assigned to tasks using @&lt;user&gt; @&lt;date&gt;](#planning:0)
- [User should be a able to use keyboard shortcut for preview](#doing:20)