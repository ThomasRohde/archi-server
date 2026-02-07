# Introduction
Some Archi functions can be invoked from the Archi Command Line Interface (ACLI). This can be useful for automating tasks. It means that Archi runs without launching a GUI.

## Basic format
The basic format of the CLI is as follows.

Windows

`Archi -application com.archimatetool.commandline.app -consoleLog -nosplash [options...]`

Linux

`./Archi -application com.archimatetool.commandline.app -consoleLog -nosplash [options...]`

Mac

`Archi.app/Contents/MacOS/Archi -application com.archimatetool.commandline.app -consoleLog -nosplash [options...]`

## Use

This can be invoked from a terminal interface or as part of a script (bash, batch, etc). The parts of this line are:

`Archi` - the name of the Archi application binary

`-application com.archimatetool.commandline.app` - this ensures that the ACLI and not the main application is launched

`-consoleLog` - ensures that a log is visible to display messages and exceptions

`-nosplash` - Don't show a splash screen when launching

[options...] - various options for different tasks.

## Commands and options

To find out what commands and options are available, use the `-h` or `--help` option:

`Archi -application com.archimatetool.commandline.app -consoleLog -nosplash --help`

This will print to console all available options and installed CLI providers:

```
usage: Archi -application com.archimatetool.commandline.app -consoleLog -nosplash [options...]

Common options:
---------------
 -a,--abortOnException          If present all further command line providers will not run when an exception is thrown
 -h,--help                      Show this help
 -p,--pause                     If present the console log will stay open until the RETURN key is pressed

Registered providers:
---------------------
 [Create Empty Model] Create an empty model and set to the current model (from optional template)
 [Load Model] Load a model from file and set to the current model
 [Load & Clone Collaboration Model] Load and/or clone from a local or online collaboration repository and set to the current model
 [Import from CSV] Import data from CSV into the current model
 [Import an Archi Model] Import an Archi Model
 [Import from Open Exchange XML format] Import from an Open Exchange XML format file and set to the current model
 [Run an Archi Script File] Run an Archi Script File
 [Export to CSV] Export the current model to CSV file format
 [Jasper Reports] Generate Jasper Reports from the current model
 [HTML Reports] Generate a HTML report from the current model
 [Export to Open Exchange XML format] Export the current model to the Open Exchange XML file format
 [Save Model] Save the current model to file

Options:
--------
   --createEmptyModel <*.architemplate file>               Create an empty model and set to the current model. If <*.architemplate file> is
                                                           set, this will be used as the model's template.
   --csv.export <path>                                     Export the current model in CSV format to the given path.
   --csv.exportDelimiter <delimiter>                       Delimiter to use for CSV export. One of "," ";" or "\t" (optional, default is
                                                           ",")
   --csv.exportEncoding <encoding>                         Encoding to use for CSV export. One of "UTF-8", "UTF-8 BOM" or "ANSI" (optional,
                                                           default is "UTF-8",)
   --csv.exportExcelCompatible                             Make Excel compatible (optional, default is false).
   --csv.exportFilenamePrefix <prefix>                     Prefix for file names to use for CSV export (optional, default is none).
   --csv.exportStripNewLines                               Strip newline characters for CSV export (optional, default is false).
   --csv.import <*.csv file>                               Import into the current model in CSV format from the supplied csv file.
   --html.createReport <path>                              Create a HTML Report from the current model to the folder set at <path>.
   --importModel <*.archimate file>                        Import into the current model from the supplied *.archimate file.
   --importModel.update                                    Update and replace from imported model.
   --importModel.updateAll                                 Update documentation and properties of model and top-level folders.
   --jasper.createReport <path>                            Create Jasper Reports from the current model to the folder set at <path>.
   --jasper.filename <name>                                File name to use for Jasper Reports (required).
   --jasper.format <format>                                List of comma separated output formats for Jasper Reports. Any of
                                                           PDF,HTML,RTF,PPT,ODT,DOCX (optional, default is PDF).
   --jasper.locale <locale>                                Locale for Jasper Reports in "en_GB" format (optional, default is the current
                                                           system locale).
   --jasper.template <main.jrxml>                          Full path to the main.jrxml Jasper Reports template file (optional, default is
                                                           Customisable Report).
   --jasper.title <title>                                  Title of Jasper Reports (required).
   --loadModel <*.archimate file>                          Load a *.archimate model from file and set to the current model.
   --modelrepository.cloneModel <url>                      Clone a collaboration model from <url> to the <path> set in option
                                                           --modelrepository.loadModel (optional).
   --modelrepository.identityFile <identity file>          Path to SSH identity file (if option modelrepository.cloneModel is used with SSH
                                                           protocol))
   --modelrepository.loadModel <path>                      Load a collaboration model from the given repository folder at <path> (required
                                                           if option --modelrepository.cloneModel is used).
   --modelrepository.passFile <password file>              Path to a file containing the HTTP login password or the password to the SSH
                                                           identity file (required if option --modelrepository.cloneModel is used).
   --modelrepository.userName <userName>                   Online repository login user name (required if option
                                                           --modelrepository.cloneModel is used with HTTP protocol).
   --saveModel <*.archimate file>                          Save the current model to a *.archimate file.
   --script.runScript <script file>                        Run the script in the given file
   --xmlexchange.export <path>                             Export the current model in Open Exchange XML format to <path>.
   --xmlexchange.exportFolders                             If set, the model's folder structure will be exported as an <organization>
                                                           structure (optional, default is false).
   --xmlexchange.exportLang <lang>                         Two letter language code for export. Example - en, fr, de (optional, default is
                                                           none).
   --xmlexchange.import <*.xml file>                       Import an XML Open Exchange file and set to the current model.
```

## Priorities
Each CLI provider has a priority according to its type:

```
PRIORITY_LOAD_OR_CREATE_MODEL = 10
PRIORITY_IMPORT = 20
PRIORITY_RUN_SCRIPT = 30
PRIORITY_REPORT_OR_EXPORT = 40
PRIORITY_SAVE_MODEL = 50
```

Lower numbers mean that this action will occur first. i.e. loading or creating an empty model will occur before importing from CSV, which will occur before exporting or saving.

This ensures that you can use more than one CLI provider's options on the same command line without worrying about the order of the options.

## The Current Model

There is the notion of the "Current Model" (CM). This is the current ArchiMate model loaded into memory that can be used as the basis for further tasks.

## Some examples

Create a blank, empty model and set this to the CM:

```Archi -application com.archimatetool.commandline.app -consoleLog -nosplash --createEmptyModel```

Load a model from file and set this to the CM:

```Archi -application com.archimatetool.commandline.app -consoleLog -nosplash --loadModel "/path/mymodel.archimate"```

Load a model from file, set this to the CM and then export to CSV in a folder:

```Archi -application com.archimatetool.commandline.app -consoleLog -nosplash --loadModel "/path/mymodel.archimate" --csv.export "/path/output"```

Import a model from an ArchiMate Exchange Format file, set this to the CM, and then export to a HTML report in a folder:

```Archi -application com.archimatetool.commandline.app -consoleLog -nosplash --xmlexchange.import "/path/mymodel.xml" --html.createReport "/path/output"```

## Running on Linux without graphics (headless)

Because some libraries depend on having a display driver, if you run the ACLI from Linux you may need to install and run certain libraries like gtk3 and xvfb (apt -y install libgtk3.0-cil xvfb) . For example:

```
Xvfb :99 &
export DISPLAY=:99
Archi -application com.archimatetool.commandline.app -consoleLog -nosplash --options
pkill -f 'Xvfb :99'
```

Or use ```xvfb-run```. It will start and stop Xvfb:

```
xvfb-run Archi -application com.archimatetool.commandline.app -consoleLog -nosplash --options
```

## Related
Additional information can be found in [this issue](https://github.com/archimatetool/archi/issues/333#issuecomment-353290656).