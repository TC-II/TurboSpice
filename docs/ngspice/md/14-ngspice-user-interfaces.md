# 14 Ngspice User Interfaces

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

ngspice offers a variety of user interfaces. For an overview (several screen shots) please have a
look at the ngspice web page. During simulation, all display a progress indicator (the simulation
time for transient) every few seconds. Setting option NOREFVALUE suppresses it.

## 14.1 MS Windows Graphical User Interface

If compiled properly (e.g. using the --with-wingui flag for ./configure under MINGW),
ngspice for Windows offers a simple graphical user interface. In fact this interface does not
offer much more for data input than a console would offer, e.g. command line inputs, command
history and program text output. First of all it applies the Windows API for data plotting. If you
run the sample input file given below, you will get an output as shown in Fig. 14.1.
Input file:

      ***** Single NMOS Transistor (Id-Vd), BSIM3V3
      *
      *** circuit description ***
      m1 2 1 3 0 n1 L=0.6u W=10.0u
      vgs 1 0 3.5
      vds 2 0 3.5
      vss 3 0 0
      *
      .control
      dc vds 0 3.5 0.05 vgs 0 3.5 0.5
      plot vss#branch
      .endc
      *
      * UCB parameters BSIM3v3.2
      .include ../Exam_BSIM3/Modelcards/modelcard.nmos
      .include ../Exam_BSIM3/Modelcards/modelcard.pmos
      *
      .end

The GUI consists of an I/O port (lower window) and a graphics window, created by the plot
command.

                                Figure 14.1: MS Windows GUI

The output window displays messages issued by ngspice. You may scroll the window to get
more of the text. The input box (white box) may be activated by a mouse click to accept any
of the valid ngspice commands. The lower left output bar displays the actual input file. ngspice
progress during setup and simulation is shown in the progress window (--ready--). The Stop
button will interrupt the current simulation. Data may be analysed, simulation resumed by the
command resume. However, if ngspice is running in a flow or loop from within a .control
section, this flow or loop stays interrupted, only the current simulation job will be finished by
resume. The Quit button allows exiting ngspice. If ngspice is actively simulating, due to

using only a single thread, this interrupt has to wait until the window is accessible from within
ngspice, e.g. during an update of the progress window.

In the plot window there is the upper left button, which activates a drop down menu. You may
select to print the plot window shown (a simple printer interface), set up any of the printers
available on your computer, or issue a postscript file or a SVG file of the active plot window.

A left-click in the plot window will print the coordinates of that point in the text window,
allowing data to be captured from the plot. Click, drag and release will show both start and
end points, as well as the slope of the line joining them. Click and drag with the right button
outlines a rectangle; on release a new window opens with a“zoomed” plot of that rectangular
area.

Instead of plotting with black background, you may set the background to any other color,
preferably to ‘white’ using the command shown below.

Input file modification for white background:

      .control
      run
      * white background
      set color0=white
      * black grid and text (only needed with X11, automatic with MS Win)
      set color1=black
      * wider plot lines
      set xbrushwidth=2
      plot vss#branch
      .endc

                          Figure 14.2: Plotting with white background

Many more set command options are available to customize the plot window. To name a few
(please see 13.7 for details): colorN, gridsize, gridstyle, plotstyle, pointchars, ticchar, ticmarks,
ticlist, wfont1 , wfont_size, xbrushwidth, xgridwidth, xfont2 , xfont_size.
As ngspice supports UNICODE text, fonts supporting other letterings than plain English may
be selected, e.g. Korean, Japanese, Chinese, Cyrillic, Arabic etc..

## 14.2 MS Windows Console

If the --with-wingui flag for ./configure under MINGW is omitted (see 28.2.4) or console_debug
or console_release is selected in the MS Visual Studio configuration manager, then
ngspice will compile without any internal graphical input or output capability. This may be useful
if you apply ngspice in a pipe inside the MSYS window, or use it being called from another
program, and just generating output files from a given input. The plot (13.5.55) command will
not work and leads to an error message. In the MS Windows release of ngspice its binary is
distributed as ngspice_con.exe.
Only on the ngspice console binary in MS Windows input/output redirection is possible, if
ngspice is called (e.g. within a MSYS shell or from a shell script) like
$ ngspice_con < input.
This feature is used in the new CMC model test suite (to be described elsewhere), thus requires
a console binary.
   1 Win GUI only
   2 X11 only

You still may generate graphics output plots or prints by gnuplot (13.5.38), if installed properly
(14.7), by pyplot (and 14.8) or by selecting a suitable printing option (14.6).

## 14.3 Linux

The standard user interface is a console for input and the X11 graphics system for output with
the interactive plot (13.5.55) command. If ngspice is compiled with the –without-x flag for
./configure, a console application without graphical interface results. For more sophisticated
input user interfaces please have a look at Chapt. 14.9.
The X11 UI has buttons to save the plot in formats suitable for printing or inclusion in a web
page. The mouse actions in the plot window are the same as the Windows UI. In addition, when
the pointer is in the plot, keyboard input is inserted at the pointer position so that the plot can
be annotated. Annotations are included in saved files.

## 14.4 MSYS, CygWin and MacOS

The these interfaces are similar to the Linux interface (14.3), i.e. console input and X11 graphics
output. Install XQuartz for X11 on MacOS. To avoid the warning of a missing graphical
user interface on Windows, you may have to start the X11 window manager by issuing these
commands from the CygWin window before starting ngspice.
$ export DISPLAY=:0.0
$ xwin -multiwindow -clipboard &

## 14.5 Error handling

Error messages and error handling in ngspice have grown over the years, include a lot of ‘traditional’
behavior and thus are not very systematic and consistent.
Error messages may occur with the token ‘Error:’. Often the errors are non-recoverable and will
lead to exiting ngspice with error code 1. Sometimes, however, you will get an error message,
but ngspice will continue, and may either bail out later because the error has propagated into
the simulation, sometimes ngspice will continue, deliver wrong results and exit with error code
0 (no error detected!).
In addition ngspice may issue warning messages like ‘Warning: ...’. These should cover recoverable
errors only.
So there is still work to be done to define a consistent error messaging, recovery or exiting. A
first step is the user definable variable strict_errorhandling. This variable may be set in files
spinit (12.5) or .spiceinit (12.6) to immediately stop ngspice, after an error is detected during
parsing the circuit. An error message is sent, the ngspice exit code is 1. This behavior deviates
from traditional SPICE error handling and thus is introduced as an option only.
XSPICE error messages are explained in Chapt. 25.

## 14.6 Output-to-file options

ngspice offers a large variety of writing simulation results into a file. This chapter will give a
short summary of the available options.

### 14.6.1 Graphics files

#### 14.6.1.1 SVG

How to prepare a plot
Various SVG settings are given by setting the following two variables:

svg_intopts Sets the plot parameters by numbers "svgwidth", "svgheight", "svgfont-size",
      "svgfont-width", "svguse-color", "svgstroke-width", "svggrid-width", .

svg_stropts Sets the plot parameters by strings "svgbackground", "svgfont-family", "svg-
     font" . Use command setcs to keep upper and lower case.

Usage

      .control
      set svg_intopts = ( 512 384 20 0 1 2 0 )
      setcs svg_stropts = ( blue Arial Arial )
      .endc

The following variables may override some of the above mentioned parameters or provide more
details.

hcopyfont This variable specifies the font name for hardcopy output plots. The value is device
      dependent.

hcopyfontsize This is a scaling factor for the font used in hardcopy plots.

hcopydevtype The variable specifies the type of the printer output to use in the hardcopy
     command. It has to be set to set hcopydevtype=svg.

hcopyscale This is a scaling factor for the font used in hardcopy plots (between 0 and 10).

hcopywidth Sets width of the hardcopy plot.

hcopyheight Sets height of the hardcopy plot.

colorN These variables determine the colors used during plotting. Color values may be entered
      as RGB values from 0 to 255 (hex or decimal) or stating a color name. The identification
      number N may be an integer between 0 and 20. Color0 is the background, color1 is the
      grid and text color, and color ids from 2 through 20 are used for graphs (vectors) plotted.
      The available color strings are (use the string inside of the hyphens): "black", "white",
      "red", "blue", "#FFA500" (orange), "green", "#FFC0C5" (pink), "#A52A2A" (brown),
      "#F0E68C" (khaki), "#DDA0DD" (plum), "#DA70D6" (orchid), "#EE82EE" (violet),

     "#B03060" (maroon); "#40E0D0" (turqoise), "#A0522D" (sienna), "#FF7F50" (coral),
     "cyan", "magenta", "#666" (gray for smith grid), "#949494" (gray for smith grid), "#888"
     (gray for normal grid). Examples are set color3=blue or set color3="#EE82EE".
     If no color id is set, then the above mentioned, predefined set of colors is applied auto-
     matically.

xbrushwidth Linewidth for graph (see xgridwidth for border and grid). Valid for MS Win-
     dows GUI, X11, gnuplot and Postscript.

xgridwidth Linewidth for border and grid. Valid for MS Windows GUI, X11, gnuplot and
     Postscript.

The plot-to-file command

     hardcopy file vector <vectors> <title text> <xlabel text> <ylabel text>

Usage

     .control
     * simulation commands here
     set hcopydevtype = svg
     set svg_intopts = ( 512 384 20 0 1 2 0 )
     setcs svg_stropts = ( yellow Arial Arial )
     set color1=blue
     set color2=green
     hardcopy plot_1.svg vss#branch title ’Plot no. 4’
     + xlabel ’Drain voltage’ ylabel ’Drain current’
     * plot to screen commands here
     .endc

Plot-to-screen
The file contents may be plotted to the screen. For MS Windows you may use the Internet
Explorer or EDGE, linked to the .svg file extension. Under Cygwin or Linux you may install
the program feh for plotting with the following commands:
Plot to screen commands

     * for MS Windows only
     if $oscompiled = 1 | $oscompiled = 8
       shell Start plot_1.svg
     else
     * for CYGWIN, Linux
       shell feh --magick-timeout 1 plot_1.svg &
     end

#### 14.6.1.2 PostScript

How to prepare a plot
   Variables to modify the PostScript plot are listed below. Background and text colors may be
set. The colors of the graphs are then chosen automatically, starting with red. Valid colors are
0: black 1: white 2: red 3: blue 4: orange 5: green 6: pink 7: brown 8: khaki 9: plum 10:
orchid 11: violet 12: maroon 13: turquoise 14: sienna 15: coral 16: cyan 17: magenta 18: gray
(for smith grid) 19: gray (for smith grid) 20: gray (for normal grid).

hcopypscolor Sets the color of the hardcopy output byselecting a integer number. If not set,
      black & white plotting is assumed with different linestyles for each output vector. A valid
      color integer value yields a colored plot background (0: black 1: white, others see above).
      and colored solid lines.
hcopypstxcolor This variable sets the color of the text in the Postscript hardcopy output. If
      not set, black on white background is assumed, if the background is colored or black,
      white text is printed.
hcopyfont This variable specifies the font name for hardcopy output plots. The value is device
      dependent.
hcopyfontsize This is a scaling factor for the font used in hardcopy plots.

hcopydevtype The variable specifies the type of the printer output to use in the hardcopy
     command. It has to be set to set hcopydevtype=svg.
hcopyscale This is a scaling factor for the font used in hardcopy plots (between 0 and 10).

hcopywidth Sets width of the hardcopy plot.

hcopyheight Sets height of the hardcopy plot.

xbrushwidth Linewidth for graph (see xgridwidth for border and grid). Valid for MS Win-
      dows GUI, X11, gnuplot and Postscript.
xgridwidth Linewidth for border and grid. Valid for MS Windows GUI, X11, gnuplot and
      Postscript.

The corresponding input file for the examples given below is listed in Chapt. 17.1. Just add the
.control section to this file and run in interactive mode by

      $ ngspice xspice_c1_print.cir

One way is to setup your printing like this will yield a black&white plot:

      .control
      set hcopydevtype=postscript
      op
      run
      plot vcc coll emit
      hardcopy temp.ps vcc coll emit
      .endc

Then print the postscript file temp.ps to the screen. This may be done by a ngspice shell command,
depending on the operating system and the installed viewer tools (like gv or others):

      * for MS Windows only
      if $oscompiled = 1 | $oscompiled = 8
        shell Start /B temp.ps
      * for CYGWIN
      else
        shell gv temp.ps &
      end

You can add color traces to it if you wish:
      .control
      set hcopydevtype=postscript
      * allow color and set background color if set to value >= 0
      set hcopypscolor=1 ; white
      set hcopypstxcolor = 3 ; blue
      * The colors of the graphs are set automatically.
      set xgridwidth=2
      set xbrushwidth=3
      run
      hardcopy temp.ps vcc coll emit
      .endc

Then print the postscript file temp.ps to a postscript printer.
You can also direct your output directly to a designated printer (not available in MS Windows):
      .control
      set hcopydevtype=postscript
      *send output to the printer kec3112-clr
      set hcopydev=kec3112-clr
      hardcopy out.tmp vcc coll emit
      .endc

#### 14.6.1.3 PNG

There is no png driver integrated into ngspice. One may use the gnuplot interface (see 14.7) to
create a png file.
Usage

      .control
      * simulation commands here
      set gnuplot_terminal=png/quit
      gnuplot plot_1 vss#branch vss2#branch
      + title ’Drain current versus drain voltage’
      + xlabel ’Drain voltage / V’ ylabel ’Drain current / uA’
      * plot to screen commands here
      .endc

This command sequence will generate a png file plot_1.png in the current directory. You will
need to have gnuplot installed.
A few remarks are due: Generally you should use a text editor for the input files that allows
to set the character encoding to utf-8. you may give a true µA in the label text, not only the
uA. Otherwise a µ in the input file may lead ngspice to fail the utf-8 syntax test. For sake of
having not enough characters per line available in the final pdf manual to fitting the gnuplot
command, the line continuation is used in the above example with a + character in the first
column. Unfortunately this has a strange side effect in a real ngspice input file, in that all letters
become lower case in the continuation lines. So better create a single (long) line containing the
complete gnuplot command.
Plotting the png file to the screen can be achieved from within the .control section by
Plot to screen commands

      * for MS Windows only
      if $oscompiled = 1 | $oscompiled = 8
        shell Start c:\"program files"\irfanview\i_view64.exe plot_1.png
      else
      * for CYGWIN, Linux
        shell feh --magick-timeout 1 plot_1.png &
      end

You will need to install a suitable viewer program (e.g. irfanview or feh).

#### 14.6.1.4 VCD

Value Change Dump (VCD) (also known less commonly as "Variable Change Dump") is an
ASCII-based format for dumpfiles generated by event based logic simulation. The eprvcd command
is used by ngspice to print out the digital event nodes and real-valued expressions versus
time.
General Form:

      eprvcd [-t unit][-a] node1 node2 .. noden [ > filename ]

Example usage:

      eprvcd 1 2 3 4 5 6 7 8 s0 s1 s2 s3 c3 > adder_x.vcd

Values for analog nodes and expressions (as for plot ) may be included, but expressions may
not contain spaces. Option “-t” sets the VCD file’s time unit; values are rounded to a negative
power of 10. If not used the unit is chosen to fit the simulation’s maximum timestep. Analog
values are examined only when an XSPICE event values changes unless option “-a” is used to
dump them at each timestep.
The file addr_x.vcd may be displayed by the following .control section (gtkwave has to be
installed):

Plot to screen commands

      * plotting the vcd file (e.g. with GTKWave)
      * For Windows: returns control to ngspice
      if $oscompiled = 1 | $oscompiled = 8
        shell start gtkwave adder_x.vcd --script nggtk.tcl
      else
      * for CYGWIN, Linux, others
        shell gtkwave adder_x.vcd --script nggtk.tcl &
      end

with the tcl script to control gtkwave
nggtk.tcl

      # tcl script for gtkwave: show vcd file data created by ngspice
      set nfacs [ gtkwave::getNumFacs ]
      for {set i 0} {$i < $nfacs } {incr i} {
          set facname [ gtkwave::getFacName $i ]
          set num_added [ gtkwave::addSignalsFromList $facname ]
      }
      gtkwave::/Edit/UnHighlight_All
      gtkwave::/Time/Zoom/Zoom_Full

### 14.6.2 Tabulated files

#### 14.6.2.1 Rawfile

This is the traditional spice-compatible output file for simulation data. It will be generated
during simulation if ngspice is started in batch mode (12.4.1) like

      ngspice -b -r mysim.raw -o mysim.log myinput.cir

where mysim.raw, following the -r flag, is the rawfile. It may be created as well from inside a
control section using the write command (13.5.108) like

      write mysim.raw all

If not all result vetcors are to be stored in the rawfile, the .save command (11.6.1) will limit
the number of vectors to the ones liste after the command. One also may limit their numbers if
the vectors are explicitely stated in the write command

      write mysim.raw v(node1) v2#branch

The rawfile consists of an ascii header, followed by the data, either in ascii or binary format.

filetype This can be either ascii or binary, and determines the format of the raw file (com-
     pact binary or text editor readable ascii). The default is binary.

All simulations (e.g. if .tran follow .ac) will be saved consecutively. If using the write command,
setting variable appendwrite will allow storing several sim outputs in a single file.

appendwrite Append to the file when a write command is issued, if one already exists.

#### 14.6.2.2 Command wrdata

wrdata generates a file containing simulation data in a tabular fashion. For details please see
13.5.107. The following variables and options are aknowledged:

appendwrite Append to the file when a write command is issued, if one already exists.

numdgt The number of digits to use when printing tables of data (print col). The default
      precision is 6 digits. On the PC, approximately 16 decimal digits are available using
      double precision, so p should not be more than 16. If the output number is negative, one
      digit less is printed to ensure constant widths in tables.

wr_singlescale The scale vector will be printed only once, if all scale vectors are of the same
      length.

wr_vecnames Scale and data vector names are printed on the first row.

#### 14.6.2.3 Command wrs2p, Touchstone File Format Version 1

wrs2ps allows to write a file, containing S parameter data, in the Touchstone File Format
Version 1. For details please see 13.5.110 for the command and 13.9 for generating the S-
parameters.

#### 14.6.2.4 Output redirection

Anything that is printable to the console by a control section command, may be redirected into
a file. See also 13.4.1.
Example usage:

      * create a new file and write to it
      echo new file > nfile.txt
      * append line to existing file
      echo second line >> nfile.txt

The following variable is recognized:

noclobber Don’t overwrite existing files when doing IO redirection.

#### 14.6.2.5 Command echo

Echos all text, variables and vectors to the screen or the redirected output location (see also
13.5.26).
Example usage:

      * variable
      setcs myvar=great
      set empty=""
      * vector
      let lineno=1
      * empty line
      echo
      * vectors and variables may be included
      echo This is a $myvar output with $&lineno line(s).
      * no line feed, empty var to allow blank
      echo -n This is still a $myvar output $empty
      echo with $&lineno line(s).

#### 14.6.2.6 Command print

General Form:

      print [col] [line] expr ...

Prints the vector(s) described by the expression expr. Please see 13.5.58 for details. Expression
expr. may be a list of vectors, but also a mathematical expression combining vectors and
constants according to 13.2.
Example:

      print v(1) 3*v(2)

The following variables and options are aknowledged:

appendwrite Append to the file when a write command is issued, if one already exists.

moremode If moremode is set, whenever a large amount of data is being printed to the screen
     (e.g, the print or asciiplot commands), the output is stopped every screenful and
     continues when a carriage return is typed. If moremode is unset, then data scrolls off the
      screen without pausing.
noprintscale Don’t print the scale in the leftmost column when a print col command is
      given.
numdgt The number of digits to use when printing tables of data (print col). The default
      precision is 6 digits. On the PC, approximately 16 decimal digits are available using
      double precision, so p should not be more than 16. If the output number is negative, one
      digit less is printed to ensure constant widths in tables.

#### 14.6.2.7 Command eprint

Prints event driven nodes to the console (or a file when using output redirection). See 13.5.29
and 23.2.2 for an example.

## 14.7 Gnuplot

### 14.7.1 Using Gnuplot to produce 1D graphs of (electrical) simulation re-

           sults

Plotting with Gnuplot is directly available from the ngspice .control section or interactive command.
Install Gnuplot (on Linux available from the distribution, on Windows available here).
On Windows, expand the zip file to a directory of your choice, add the path <any directory>/gnuplot/bin
to the PATH variable, and off you go... The command to invoke Gnuplot
(13.5.38) is limited to x/y plots (no polar etc.).
General Form:

      gnuplot file plotargs

plotargs is a list of vectors to be plotted. file may either be temp or tmp or a file name
(without file extension).
Plot window only:

      gnuplot temp vss#branch vss2#branch
      + title ’Drain current versus drain voltage’
      + xlabel ’Drain voltage / V’ ylabel ’Drain current / uA’

ngspice generates temporary data and command files for Gnuplot, calls Gnuplot for openening
the plot windows and then discards the temporary files.
Plot window plus command and data files:

      gnuplot newplot vss#branch vss2#branch
      + title ’Drain current versus drain voltage’
      + xlabel ’Drain voltage / V’ ylabel ’Drain current / uA’

Gnuplot command file newplot.plt and data file newplot.data are generated to stay in the current
directory. The command file may be modified to alter the plot, and then called by gnuplot
newplot.plt to draw the modified plot.

The following variables are aknowledged by the gnuplot command:

gnuplot_terminal May be one of the following: png (write png file and plot to screen),
     png/quit (write png file but no plot, see 14.6.1.3), eps (write PostScript file and plot
     to screen), eps/quit (write PostScript file, but no plot), xterm (open gnuplot in an
      xterm window).

xbrushwidth Linewidth for graph (see xgridwidth for border and grid). Valid for MS Win-
      dows GUI, X11, gnuplot and Postscript.
xgridwidth Linewidth for border and grid. Valid for MS Windows GUI, X11, gnuplot and
      Postscript.
plotstyle This should be one of linplot, combplot, or pointplot. linplot, the default,
     causes points to be plotted as parts of connected lines. combplot causes a comb plot to be
      done. It plots vectors by drawing a vertical line from each point to the X-axis, as opposed
      to joining the points. pointplot causes each point to be plotted separately.
nolegend Don’t plot the legend, when using the plot command.

### 14.7.2 Using gnuplot to produce 2D contour plots for Cider

The gnuplot command to generate 2D x/y contour plots from Cider models is:
General Form:

      gnuplot file xycontour expr

The xycontour switch is ignored if the data is not from a 2D Cider model. expr is a single
plotarg expression which specifies the vector to be plotted. file has the same meaning as
in section 14.7.1 previously. The only variable which affects the gnuplot xycontour option is
gnuplot_terminal.
Before a plot can be created, the Cider solution file containing the data you are interested in must
be loaded with the LOAD (13.5.47) command. The example later in this section demonstrates
the steps to be followed.
The Cider OUTPUT command (see 26.14) explains how to get solution files for a Cider model. It
is important to include a ’rootfile’ parameter in the OUTPUT command which specifies a subdirectory
to hold the solution files themselves. Depending on the analysis type, solution files have
a prefix OP, DC, or TR. There can be many of these files created, one per DC sweep value or
per TR time step, so it is essential the ’rootfile’ subdirectory is created prior to running ngspice
to generate the solution files. In addition, device instances D*, Q*, and M* of Cider models
need to have the ’SAVE’ parameter set.
The 2D Cider models are NUMD level 2 (see 26.17), NBJT level 2 (see 26.18), and NUMOS
(see 26.19). 1D Cider models are level 1 NUMD and NBJT. The solution files for 1D models
can be plotted as the normal curves using PLOT (13.5.55) and GNUPLOT (without xycontour,
13.5.38 and 14.7.1).

#### 14.7.2.1 Example of a 2D jfet

File jfet1.cir, is run as follows from a bash console window (Linux, or MSYS2):
mkdir ./j1root
ngspice -b jfet1.cir
Filenames will need to be modified appropriately for Windows.
Notes relating to the jfet1.cir file:

  1. The QJ1 instance line has the ’SAVE’ parameter, and the ’rootfile’ subdirectory is speci-
     fied on the output statement.

  2. A Cider solution file is loaded after the simulation has run and before the gnuplot com-
     mands:
      load ./j1root/DC.12.qj1
      The currently active vectors are listed after the load.

  3. The sleep commands (or timeout /t on Windows) give the display time to draw the con-
     tours. This is only necessary when executing a batch script; for an interactive session they
     are not required.

  4. The contours of a single vector phin are plotted by:
      gnuplot gplot1 xycontour phin

  5. The contours of the electric field magnitude are plotted by:
      gnuplot gplot2 xycontour sqrt((ex * ex) + (ey * ey))

  6. The gnuplot_terminal variable controls the output from gnuplot:
      set gnuplot_terminal=png/quit

  7. Following this, gnuplot commands will send the plot to a .png file.

JFET example netlist jfet1.cir:

      ****** jfet1.cir ******
      *Two-dimensional Junction Field-Effect Transistor (JFET)
      VDD 1 0 0.5V
      VGG 2 0 -1.0v AC 1V
      VSS 3 0 0.0V
      QJ1 1 2 3 M_NJF AREA=1 SAVE
      .MODEL M_NJF NBJT LEVEL=2
      + options jfet defw=10.0um
      + output rootfile="./j1root/" psi n.conc p.conc phin phip equ.psi vac.psi
      + x.mesh w=0.2 h.e=0.001 r=1.8
      + x.mesh w=0.8 h.s=0.001 h.m=0.1 r=2.0
      + x.mesh w=0.8 h.e=0.001 h.m=0.1 r=2.0
      + x.mesh w=0.2 h.s=0.001 r=1.8
      + y.mesh w=0.2 h.e=0.01 r=1.8
      + y.mesh w=0.8 h.s=0.01 h.m=0.1 r=1.8
      +
      + domain num=1 mat=1
      + material num=1 silicon
      +
      + elec num=1 x.l=0.0 x.h=0.0 y.l=0.0 y.h=1.0
      + elec num=2 x.l=0.5 x.h=1.5 y.l=0.0 y.h=0.0
      + elec num=3 x.l=2.0 x.h=2.0 y.l=0.0 y.h=1.0
      +
      + doping unif n.type conc=3.0e15
      + doping unif p.type conc=2.0e17 x.l=0.2 x.h=1.8 y.h=0.2
      +
      + models bgn srh auger conctau concmob fieldmob ^aval
      .option bypass=1 temp=27

      .control
      dc vgg 0.0 -2.0001 -0.1
      print i(vss)
      load ./j1root/DC.12.qj1
      shell ’sleep 1’
      gnuplot gplot1 xycontour phin
      shell ’sleep 1’
      gnuplot gplot2 xycontour sqrt((ex * ex) + (ey * ey))
      shell ’sleep 1’
      set gnuplot_terminal=png/quit
      gnuplot gplot3 xycontour phin
      shell ’sleep 1’
      gnuplot gplot4 xycontour sqrt((ex * ex) + (ey * ey))
      shell ’sleep 1’
      quit
      .endc

      .end

The two contour graphs thus simulated are shown here:

                                   Figure 14.3: Potential

                                Figure 14.4: Electrical field

## 14.8 pyplot

The command pyplot renders simulated vectors with matplotlib — a Python counterpart to the
existing gnuplot (14.7) command. Python, numpy and matplotlib need to be installed.

General Form:

      pyplot <file> <plot expressions...>

Like gnuplot, the first word is the output file base name and the rest are ordinary plot expressions
(the same syntax plot accepts). pyplot writes a <file>.data table and a <file>.py matplotlib script
and runs Python on it:

Usage:

      .control
      run
      pyplot rc v(out) v(in) ; opens an interactive matplotlib window
      .endc

The output file name may be omitted, as the vectors to be plotted are auto-detected.

Two set variables control it:

• pyplot_terminal=png — render headless (matplotlib’s Agg backend) to <file>.png instead
of opening a window. Ideal for batch/-b runs and CI.

• pyplot_python=<interp> — the Python interpreter to run (default python3).

Stacked subplots and matplotlib style sheets are supported, both driven by set variables.

set pyplot_subplots=N — stacked panels

By default pyplot draws every trace on one axis. Setting pyplot_subplots=N lays the traces out
as stacked subplots sharing the x-axis, N traces per panel:

      set pyplot_subplots=1
      pyplot v(in) v(a) v(b) ; three stacked panels, one trace each
      set pyplot_subplots=2
      pyplot v(a) v(b) v(c) v(d) ; two panels, two traces each

The number of panels is ceil(numtraces / N); the x-label appears on the bottom panel, the
title becomes the figure’s subtitle, and each panel gets its own grid, log scaling, limits, and
legend. 0 (or unset) is the original single-axis behaviour.

                    Figure 14.5: pyplot, four stacked panels, one trace each

Example usage:

      .control
      tran 10n 1000n
      set pyplot_subplots=1
      pyplot Vin out1 out2 out3 title ’no. 4’
      .endc

Note on vs: In command plot, vs already selects the x-axis vector (plot y vs x), and pyplot goes
through the same plotit() expression parser — so vs is not a panel separator. Multi-panel layout
is chosen with set pyplot_subplots instead.
set pyplot_style=<name> — matplotlib style sheets

pyplot_style applies a matplotlib style sheet to the whole figure, e.g. ggplot, bmh, seaborn-v0_8.
The short name dark aliases matplotlib’s dark_background:

      set pyplot_style=dark
      pyplot v(out) ; dark theme

An unrecognised style name is ignored (wrapped in try/except) rather than aborting the plot.
14.9. INTEGRATION WITH CAD SOFTWARE AND ‘THIRD PARTY’ GUIS                                  503

## 14.9 Integration with CAD software and ‘third party’ GUIs

In this chapter you will find some links and comments on GUIs for ngspice offered from other
projects and on the integration of ngspice into a circuit development flow. The data given rely
mostly on information available from the web and thus is out of our control. It also may be far
from complete. For a list of actual links with more than 20 entries please have a look at the
ngspice web pages. Some open source tools are listed here. The GUIs MSEspice and GNUS-
piceGUI help you to navigate the commands to need to perform your simulation. XCircuit and
the GEDA tools gschem and gnetlist offer integrating schematic capture and simulation. KiCad
offers a complete design environment for electronic circuits. Xschem focusses on IC design,
supporting all the open source PDKs.

### 14.9.1 KiCad

KiCad is a cross platform and open source electronics design automation suite. Its schematic
editor Eeschema fully integrates shared ngspice (see Chapt. 15) as the simulation tool. The target
audience is PCB circuit designers, using discrete devices, ICs and passives. On the ngspice
web pages there is a tutorial available which presents an introduction to using ngspice from
within KiCad. Simulation examples are presented at KiCad/ngspice simulation examples 1 and
KiCad/ngspice simulation examples 2.

### 14.9.2 Xschem

Xschem is a schematic capture program, it allows to create a hierarchical representation of
circuits with a top down approach . By focusing on interconnections, hierarchy and properties
a complex system (IC) can be described in terms of simpler building blocks. A VHDL, Verilog
or ngspice netlist can be generated from the drawn schematic, allowing the simulation of the
circuit. The target audience is IC designers, especially the open source PDKs from Skywater,
Google and IHP are supported. An excellent video introduces the design and simulation of a
CMOS comparator.

### 14.9.3 Qucs-S

Qucs-S is a circuit simulation program based on the Qucs circuit simulator. The "S" letter
indicates SPICE. The purpose of the Qucs-S project is to use free SPICE circuit simulation
kernels with the GUI based on Qt toolkit. It merges the power of SPICE and the simplicity of
the Qucs GUI. Qucs-S is not a simulator by itself, but it requires to use an external simulation
backend, e.g. ngspice, with it. Quc-S is strong when simulating RF devices and circuits.

### 14.9.4 GNU Spice GUI

A GUI, to be found at https://sourceforge.net/projects/gspiceui/. It aids in viewing, modifying,
and simulating SPICE CIRCUIT files.

### 14.9.5 XCircuit

CYGWIN and especially Linux users may find XCircuit valuable to establish a development
flow including schematic capture and circuit simulation.

### 14.9.6 NyanCAD Mosaic

Mosaic is a web-based tool for designing and simulating analog integrated circuits. It focuses
on a modern, easy to use interface, instant design feedback, design reuse, verification, and
automation. ngspice is supported as simulator.
https://nyancad.com/docs/
https://github.com/NyanCAD/Mosaic

### 14.9.7 MSEspice

A graphical front end to ngspice, using the Free Pascal cross platform RAD environment
MSEide+MSEgui.

### 14.9.8 GNU Octave

GNU Octave is a high-level language, primarily intended for numerical computations. An
interface to ngspice is available here.
