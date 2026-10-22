# 12 Starting ngspice

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

## 12.1 Introduction

Ngspice consists of the simulator and a front-end for data analysis and plotting. Input to the
simulator is a netlist file, including commands for circuit analysis and output control. Interactive
ngspice can plot data from a simulation on a PC or a workstation display.
The usual way to run ngspice is by a console command, passing options and at least one netlist
file as a parameter. Multiple netlists are concatenated and treated as one, except when the first
file is a pure script with parameters (13.8).
Ngspice on Linux (and OSs like MacOS, Cygwin, BSD, Solaris ...) uses the X Window System
for plotting (see Chapt. 14.3) if the environment variable DISPLAY is available. (An X11 server
must first be installed on MacOS.) Otherwise, a console mode (non-graphical) interface is used.
If you are using X on a workstation, the DISPLAY variable should already be set; if you want
to display graphics on a system different from the one you are running ngspice or ngutmeg on,
DISPLAY should be of the form machine:0.0. See the appropriate documentation on the X
Window System for more details.
The MS Windows GUI version of ngspice has a native graphics interface (see Chapt. 14.1).

## 12.2 Where to obtain ngspice

The actual distribution of ngspice may be downloaded from the ngspice download web page.
The installation for Linux or MS Windows is described in the file INSTALL to be found in
the top level directory. You may also have a look at Chapt. 28 of this manual for compiling
instructions.
If you want to check out the source code that is actually under development, you may have a
look at the ngspice source code repository, which is stored using the Git Source Code Management
(SCM) tool. The Git repository may be browsed on the Git web page, also useful for
downloading individual files. You may however download (or clone) the complete repository
including all source code trees from the console window (Linux, CYGWIN or MSYS/MINGW)
by issuing the command (in a single line)
git clone git://git.code.sf.net/p/ngspice/ngspice

You need to have Git installed, which is available for all three OSs. The whole source tree
is then available in <current directory>/ngspice. Compilation and local installation is again
described in INSTALL (or Chapt. 28). If you later want to update your files and download the
recent changes from SourceForge into your local repository, cd into the ngspice directory and
just type

git pull

git pull will not overwrite modified files in your working directory. To drop your local changes
first, you can run

git reset --hard

To learn more about git, which can be both powerful and difficult to master, please consult
http://git-scm.com/, especially: http://git-scm.com/documentation, which has pointers to documentation
and tutorials.

## 12.3 Command line options for starting ngspice

Command Synopsis:

      ngspice [ -o logfile] [ -r rawfile] [ -b ] [ -i ] [ input files ]

Where data file is the standard ngspice rawfile.

Options are shown below.

  Option        Long option        Meaning
    -n       --no-spiceinit        Don’t try to source the file upon start-up. Normally
                                   ngspice seeks to find it according to the search folder
                                   sequence described in 12.6.
 -t TERM    --terminal=TERM        The program is being run on a terminal with mfb name
                                   term (obsolete).
    -b           --batch           Run in batch mode. Ngspice reads the default input source
                                   (e.g. keyboard) or reads the given input file and performs
                                   the analyses specified; output is either Spice2-like
                                   line-printer plots ("ascii plots") or a ngspice rawfile. See
                                   the following section for details. Note that if the input
                                   source is not a terminal (e.g. using the IO redirection
                                   notation of "<") ngspice defaults to batch mode (-i
                                   overrides). This option is valid for ngspice only.
    -s           --server          Run in server mode. This is like batch mode, except that a
                                   temporary rawfile is used and then written to the standard
                                   output, preceded by a line with a single "@", after the
                                   simulation is done. This mode is used by the ngspice
                                   daemon. This option is valid for ngspice only.
                                   Example for using pipes from the console window:
                                   cat adder.cir|ngspice -s|more
    -i        --interactive        Run in interactive mode. This is useful if the standard input
                                   is not a terminal but interactive mode is desired. Command
                                   completion is not available unless the standard input is a
                                   terminal, however. This option is valid for ngspice only.
 -r FILE      --rawfile=FILE       Use rawfile as the default file into which the results of the
                                   simulation are saved. This option is valid for ngspice only.
    -p            --pipe           Allow a program (e.g., xcircuit) to act as a GUI frontend
                                   for ngspice through a pipe. Thus ngspice will assume that
                                   the input pipe is a tty and allow running in interactive
                                   mode.
 -o FILE      --output=FILE        All logs generated during a batch run (-b) will be saved in
                                   outfile.
    -h            --help           A short help statement of the command line syntax.
    -v          --version          Prints a version information.
              -version-small       Output small version information
    -f         -version-full       Output full version information
    -a           --autorun         Start simulation immediately, as if a control section
                                   .control
                                   run
                                   .endc
                                   had been added to the input file.
              --soa-log=FILE       output from Safe Operating Area (SOA) check
    -D           --define          Set a variable (13.8.1), to be used in a .control section.
                                   -D var1 will set a boolean variable named var1,
                                   -D var2=7 will set a variable with its value.

Further arguments to ngspice are taken to be ngspice input files, which are read and saved (if

running in batch mode then they are run immediately). Ngspice accepts Spice3 (and also most
Spice2) input files, and outputs ASCII plots, Fourier analyses, and node printouts as specified
in .plot, .four, and .print cards. If an out parameter is given on a .width card (11.6.7),
the effect is the same as set width = .... Since ngspice ASCII plots do not use multiple ranges,
however, if vectors together on a .plot card have different ranges they do not provide as much
information as they do in a scalable graphics plot.

## 12.4 Starting options

### 12.4.1 Batch mode

Let’s take as an example the Four-Bit binary adder MOS circuit shown in Chapt. 17.6, stored
in a file adder-mos.cir. You may start the simulation immediately by calling
ngspice -b -r adder.raw -o adder.log adder-mos.cir
ngspice will start, simulate according to the .tran command and store the output data in a
rawfile adder.raw. Comments, warnings and info messages go to log file adder.log. Commands
for batch mode operation are described in Chapt. 11.

### 12.4.2 Interactive mode

If you call
ngspice
ngspice will start, load spinit (12.5) and .spiceinit (12.6, if available), and then waits for your
manual input. Any of the commands described in 13.5 may be chosen, but many of them are
useful only after a circuit has been loaded by
ngspice 1 -> source adder-mos.cir
others require the simulation to be done already (e.g. plot):
ngspice 2 ->run
ngspice 3 ->plot allv
If you call ngspice from the command line with a circuit file as parameter:
ngspice adder-mos.cir
ngspice will start, load the circuit file, parse the circuit (same circuit file as above, containing
only dot commands (see Chapt. 11) for analysis and output control). ngspice then just waits for
your input. You may start the simulation by issuing the run command. Following completion
of the simulation you may analyze the data by any of the commands given in Chapt. 13.5.

### 12.4.3 Control mode (Interactive mode with control file or control sec-

              tion)
If you add the following control section to your input file adder-mos.cir, you may call
ngspice adder-mos.cir

from the command line and see ngspice starting, simulating and then plotting immediately.
Control section:

      * ADDER - 4 BIT ALL-NAND-GATE BINARY ADDER
      .control
      save vcc#branch
      run
      plot vcc#branch
      rusage all
      .endc

Any suitable command listed in Chapt. 13.5 may be added to the control section, as well as
control structures described in Chapt. 13.6. Batch-like behavior may be obtained by changing
the control section to
Control section with batch-like behavior:

      * ADDER - 4 BIT ALL-NAND-GATE BINARY ADDER
      .control
      save vcc#branch
      run
      write adder.raw vcc#branch
      quit
      .endc

If you put this control section into a file, say adder-start.sp, you may just add the line
.include adder-start.sp

to your input file adder-mos.cir to obtain the batch-like behavior. In the following example
the line .tran ... from the input file is overridden by the tran command given in the control
section.
Control section overriding the .tran command:

      * ADDER - 4 BIT ALL-NAND-GATE BINARY ADDER
      .control
      save vcc#branch
      tran 1n 500n
      plot vcc#branch
      rusage time
      .endc

The commands within the .control section are executed in the order they are listed and only
after the circuit has been read in and parsed. If you want to have a command being executed
before circuit parsing, you may use the prefix pre_ (13.5.56) to the command.
A warning is due however: If your circuit file contains such a control section (.control ...
.endc), you should not start ngspice in batch mode (with -b as parameter). The outcome may
be unpredictable!

## 12.5 Standard configuration file spinit

At startup ngspice reads its configuration file spinit. spinit may be found in a path relative to
the location of the ngspice executable
..\share\ngspice\scripts. The path may be overridden by setting the environmental variable
SPICE_SCRIPTS to a path where spinit is located. Ngspice for Windows will additionally
search for spinit in the directory where ngspice.exe resides. If spinit is not found a warning
message is issued, but ngspice continues.

spinit contains a script, made of commands from Chapt. 13.5, that is run upon start up of
ngspice. Aliases (name equivalences) can be set. The asterisk ‘*’ comments out a line. If used
by ngspice, spinit will then load the XSPICE code models from a path relative to the current
directory where the ngspice executable resides, as well as OpenVAF compiled compact devices
models. You may also define absolute paths.

If the standard path for the libraries (see standard spinit above or /usr/local/lib/spice under
CYGWIN and Linux) is not adequate, you can add the ./configure options --prefix=/usr
--libdir=/usr/lib64 to set the codemodel search path to /usr/lib64/spice. Besides the
standard lib only lib64 is acknowledged.

Standard spinit contents:

      * Standard ngspice init file
      alias exit quit
      alias acct rusage all
      ** set the number of threads in openmp
      ** (to the number of physical cores)
      ** default (if compiled with --enable-openmp) is: 2
      set num_threads=8

      if $?sharedmode
        unset interactive
        unset moremode
      else
        set interactive
        set x11lineararcs
      end

      * comment out if central osdi management is set up
      * unset osdi_enabled

      * Load the codemodels
      if $?xspice_enabled
        codemodel ../lib/spice/spice2poly.cm
        codemodel ../lib/spice/analog.cm
        codemodel ../lib/spice/digital.cm
        codemodel ../lib/spice/xtradev.cm
        codemodel ../lib/spice/xtraevt.cm
        codemodel ../lib/spice/table.cm
      end

      * Load the OpenVAF/OSDI models
      if $?osdi_enabled
        osdi ../lib/ngspice/BSIMBULK107.osdi
        osdi ../lib/ngspice/BSIMCMG.osdi
        osdi ../lib/ngspice/psp103_nqs.osdi
        osdi ../lib/ngspice/vbic_4T_et_cf.osdi
      end

Special care has to be taken when using the ngspice shared library. If you use ngspice.dll under
Windows OS, the standard is to use relative paths for the code models as shown above. However,
the path is relative to the calling program, not to the dll. This is fine when ngspice.dll and the
calling program reside in the same directory. If ngspice.dll is placed in a different directory,
please check Chapt. 28.2.

The Linux shared library ... t.b.d.

## 12.6 User defined configuration file .spiceinit

In addition to spinit you may define a (personal) configuration file .spiceinit and put it into any
of the following locations. The typical search sequence for .spiceinit is:

   1. directory from where the netlist will be loaded

   2. user provided directory (in env. variable SPICE_USERINIT_DIR)

   3. current directory

   4. HOME (Linux)

   5. USERPROFILE (Windows).

HOME (Linux, Cygwin, macOS) may point to /home/<User name>, or /root if you are acting
as admin. USERPROFILE (MS Windows) is typically C:\Users\<User name>. To find out
what directory HOME or USERPROFILE are pointing to, enter the commands set or export
into a console window and search for the token.
In case of ngspice as a shared library item 1. of the list above may read

   1. in the directory Infile_Path received from the caller (to be sent before initialization)

.spiceinit will be read in and executed after spinit, but before any other input file is read. It
may contain further scripts, set variables, or issue commands from Chapt.13.5 to override
commands given in spinit. For example set filetype=ascii will yield ASCII output in the
output data file (rawfile), instead of the compact binary format that is used by default. set
ngdebug will yield a lot of additional debug output. Any other contents of the script, e.g.
plotting preferences, may be included here also. If the command line option -n is used upon
ngspice start up, this file will be ignored.
.spiceinit for simulating IC designs with MOS transistor data from PDKs may contain:

      * .spiceinit for use with Skywater PDK and ngspice KLU
      set ngbehavior=hsa     ; set compatibility for reading
                             ; PDK libs
      set no_auto_braces     ; omit some time consuming checks
                             ; during lib loading
      set ng_nomodcheck      ; don’t check the model parameters
      option noinit          ; don’t print operating point data
      option klu             ; select KLU as matrix solver
      optran 0 0 0 100p 2n 0 ; don’t use dc operating point,
                             ; but only transient op

set num_threads=8 should be set to the number of physical cores of the computer in use (here
for example 8 cores), set ngbehavior=hsa will ensure HSPICE compatibility with some
important and essential tweaks for the PDK, set skywaterpdk suppresses time consuming
checks during lib loading, assuming 4 nodes for a MOS device and adequately labled parameters.
set ng_nomodcheck will suppress some unwanted warnings, option noinit will suppress
the (often lengthy) printing of the operating point results. option klu often will yield

simulation speed up by a factor of 2 or more. optran ... will skip usual operating point iterations,
which for very large circuits consume much time, and replace them by a time integrated
operating point estimation.
.spiceinit for simulating circuits containing PSPICE-compatible behavioural models may contain:

      * User defined ngspice init file
      set filetype=ascii
      *set ngdebug
      *set outputpath=C:\Spice64\out
      set ngbehavior = ltpsa
      option sparse

set ngbehavior = ltpsa will provide PSPICE compatibility. option sparse (maybe omitted)
selects the venerable Sparse 1.3 matrix solver, which sometimes is much faster than klu.
Some editors on MS Windows refuse to save files with leading dot in their names. An alternative
name to .spiceinit is therefore spice.rc.

## 12.7 Environmental variables

### 12.7.1 Ngspice specific variables

SPICE_LIB_DIR default: /usr/local/share/ngspice (Linux, CYGWIN), C:\Spice\share\ngspice
      (Windows)

SPICE_EXEC_DIR default: /usr/local/bin (Linux, CYGWIN), C:\Spice\bin (Windows)

SPICE_BUGADDR default: https://ngspice.sourceforge.io/bugrep.html
      Where to send bug reports on ngspice.

SPICE_EDITOR default: vi (Linux, CYGWIN), notepad.exe (MINGW, Visual Studio)
      Set the editor called in the edit command. Always overrides the EDITOR env. variable.

SPICE_ASCIIRAWFILE default: 0
      Format of the rawfile. 0 for binary, and 1 for ascii.

SPICE_NEWS default: $SPICE_LIB_DIR/news
      A file that is copied verbatim to stdout when ngspice starts in interactive mode.

SPICE_HELP_DIR default: $SPICE_LIB_DIR/helpdir
      Help directory, not used in Windows mode

SPICE_HOST default: empty string
      Used in the rspice command (probably obsolete, to be documented)

SPICE_SCRIPTS default: $SPICE_LIB_DIR/scripts
      In this directory the spinit file will be searched.

SPICE_PATH default: $SPICE_EXEC_DIR/ngspice
      Used in the aspice command (probably obsolete, to be documented)

NGSPICE_MEAS_PRECISION default: 5
      Sets the number of digits if output values are printed by the meas(ure) command.

SPICE_NO_DATASEG_CHECK default: undefined
      If defined, will suppress memory resource info (probably obsolete, not used on Windows
      or where the /proc information system is available.)

NGSPICE_INPUT_DIR default: undefined
      If defined, using a valid directory name, will add the given directory to the search path
      when looking for input files (*.cir, *.inc, *.lib).

NGSPICE_OSDI_DIR default: undefined
      If defined, using a valid directory name, will add the given directory to the search path
      when looking for VA-Models shared library files (*.osdi).

SPICE_USERINIT_DIR default: undefined
      If defined, using a valid directory name, this is the first place to search for the user-defined
      initialization file .spiceinit (or spice.rc). The search sequence then following is: current
      directory, HOME directory, USERPROFILE directory

### 12.7.2 Common environment variables

TERM LINES COLS DISPLAY HOME PATH EDITOR SHELL POSIXLY_CORRECT

## 12.8 Memory usage

Ngspice started with batch option (-b) and rawfile output (-r rawfile) will store all simulation
data immediately into the rawfile without keeping them in memory. Thus very large circuits
may be simulated, the memory requested upon ngspice start up will depend on the circuit size,
but will not increase during simulation.
If you start ngspice in interactive mode or interactively with control section, all data will be kept
in memory, to be available for later evaluation. A large circuit may outgrow even Gigabytes of
memory. The same may happen after a very long simulation run with many vectors and many
time steps to be stored. Issuing the save <nodes> command will help to reduce memory
requirements by saving only the data defined by the command. You may also choose option
INTERP (11.1.4) to reduce memory usage.

## 12.9 Simulation time

Simulating large circuits may take an considerable amount of CPU time. If this is of importance,
you should compile ngspice with the flags for optimum speed, set during configuring ngspice

compilation. Under Linux, MINGW, CYGWIN, and macOS there are bash scripts for compiling
in the main directory of the ngspice distribution, see chapter 28. The -O2 optimization flag
for compiling and linking is used.
Under MS Visual Studio, you will have to select the releaseOMP or release versions, which
includes optimization for speed.
Several simulation periods contribute to CPU time usage. There is the setup period, especially
time consuming when externally contributed PDKs have to be resolved, or large circuits are
loaded. Due to its data structure the KLU matrix solver (11.1.1) may be advantageous here.
A lengthy (transient) simulation comprises of two activities: solving the matrix and solving
the non-linear device equations. Again, KLU is often faster than Sparse while solving the
matrix. Device evaluation, especially for MOS transistors, is sped up by parallel processing
with OpenMP (12.10). Finally data evaluation may take some additional time.
Setting no_auto_braces in spinit or .spiceinit will speed up the loading of large PDKs by
avoiding to check for unquoted parameters, so assumes that all parameters are quoted correctly
by { } or ’ ’.
In its standard configuration ngspice limits the maximum time step for transient simulation to
tstep of the tran command (11.3.10). Sometimes a significant speedup of the simulation is
achievable by setting the variable nostepsizelimit. Now the simulator selects a time step
as large as the truncation error correction allows, limited only by giving a tmax in the tran
command. Sometimes convergence issue arise, or wave forms are distorted, when selecting this
option.
The new voltage-based truncation error correction (12.12) has the potential to further optimize
the simulation speed.
XSPICE (see Chapt. 8 and II) is enabled as part of your compilation configuration. Then
the value of trtol (see 11.1.4) is set internally to 1 (instead of default 7) for higher precision if
XSPICE code model ’A’ devices included in the circuit. This may double or even triple the CPU
time needed for any transient simulation, because the amount of time steps and thus iteration
steps is more than doubled.
You may enforce higher speed during XSPICE usage by setting the variable xtrtol in your
.spiceinit initialization file or in the .control section in front of the tran command (via set
xtrtol=2 using the set command 13.5.72) and override the above trtol reduction. Beware
however of precision or convergence issues if you use XSPICE ’A’ devices, especially if xtrtol
is set to values larger than 2.

## 12.10 Ngspice on multi-core processors using OpenMP

### 12.10.1 Introduction

Today’s computers typically come with CPUs having more than one core. It will thus be useful
to enhance ngspice to make use of such multi-core processors.
Using circuits containing mostly transistors and e.g. the BSIM3 model, around 2/3 of the CPU
time is spent in evaluating the model equations (e.g. in the BSIM3Load() function). The same
happens with other advanced transistor models. Thus, such functions should be parallelized, if
possible. Solving the matrix takes about 10% to 50% of the CPU time, so parallel processing

in the matrix solver is sometimes of secondary interest only! Furthermore, such paralellization
is difficult to achieve with our Sparse and KLU matrix solvers.
Another alternative is using CUSPICE, that is ngspice (developpment based on ngspice-27)
designed for running massively parallel on NVIDIA GPUs. CUDA enhancements to C code are
applied. For LINUX, please see the user guide. For MS Windows, an executable is available at
the ngspice download pages.

### 12.10.2 Internals

A publication [1] has described a way to exactly do that using OpenMP, which is available on
many platforms and is easy to use, especially if you want to perform parallel processing of a
for-loop.
To explain the implemented approach BSIM3 version 3.3.0 model was chosen, located in the
BSIM3 directory, as the first example. The BSIM3load() function in b3ld.c contains two nested
for-loops using linked lists (models and instances, e.g. individual transistors). Unfortunately
OpenMP requires a loop with an integer index. So in file B3set.c an array is defined, filled with
pointers to all instances of BSIM3 and stored in model->BSIM3InstanceArray.
BSIM3load() is now a wrapper function, calling the for-loop, which runs through functions
BSIM3LoadOMP(), once per instance. Inside BSIM3LoadOMP() the model equations are calculated.
Typically it is necessary to use synchronization constructs such as mutexes when multiple
threads write to a common memory location. To avoid the performance degradation of such
synchronization, temporary per-thread memory locations are used within the for loop of the
BSIM3LoadOMP() function as defined in bsim3def.h. After all threads complete the for-loop,
the update to the matrix is done in an extra function BSIM3LoadRhsMat() in the main thread.
Then the thread programming needed is only a single line!!
#pragma omp parallel for
introducing the for-loop over the device instances.
This of course is made possible only thanks to the OpenMP guys and the clever trick on no
synchronization introduced by the above cited authors.
The time-measuring function getrusage() used with Linux or Cygwin to determine the CPU
time usage (with the rusage option enabled) counts tics from every core, adds them up, and
thus reports a CPU time value enlarged by a factor of 8 if 8 threads have been chosen. So now
ngspice is forced to use ftime for time measuring if OpenMP is selected.

### 12.10.3 Some results

Some results on an inverter chain with 627 CMOS inverters, BSIM4.7, 45 nm, running for
200ns, compiled with Visual Studio Community 2019 on Windows 10 (full optimization) or
gcc 7.4, SUSE Linux Leap 15.1, -O2, on a i9 9900K machine with 8 real cores (16 logical
processors using hyperthreading) and 32 GB of memory are shown in table 12.1.
So we see a ngspice speed up of more than a factor of two! Even on an Windows 7 notebook
with a dual core i7 processor, more than 1.5x improvement using two threads was attained. This

                               Table 12.1: OpenMP performance
                         Threads      CPU time [s]      CPU time [s]
                                         Windows            Linux
                             1             65.4               69.3
                             2             46.7               47.4
                             4             37.2               36.9
                             6             33.6               33.6
                             8             32.4               32.4
                             12            35.7               31.7
                             16            38.2               34.3

is consistent with the fact that roughly half of the CPU time is used for evaluating the device
model, half of the time for solving the matrix. Only the device evaluation is parallelized by
OpenMP. The time for doing this becomes negligible with 8 or more threads. Allowing more
than 8 threads (using the 8 physical cores) does not yield much improvement, even leads to a
slight increase of simulation time, because the code is not optimized for hyperthreading.

### 12.10.4 Usage

To state it clearly: OpenMP is installed inside the model equations of a particular model. It is
available in BSIM3 versions 3.3.0 and 3.2.4, but not in any other BSIM3 model, in BSIM4
versions 4.5, 4.6.5, 4.7 or 4.8, but not in any other BSIM4 model, and in B4SOI, version 4.4,
not in any other SOI model and in models added by the OSDI interface. Older parameter files
of version 4.6.x (x any number up to 5) are accepted, you have to check for compatibility.
OpenMP is enabled as a default during ngspice compilation with gcc on all operating systems.
Under MS Windows with Visual Studio the preprocessor flag USE_OMP, and the /openmp flag
in Visual Studio are enabled when selecting the ReleaseOMP configuration.
The number of threads has to be set manually by placing
set num_threads=4
into spinit or .spiceinit or in the control section of the SPICE input file. If OpenMP is enabled,
but num_threads not set, a default value num_threads=2 is set internally.
If you simulate a circuit, please keep in mind to select BSIM3 (levels 8, 49) version 3.2.4 or
3.3.0 (7.6.3.3), by placing this version number into your parameter files, BSIM4 (levels 14, 54)
version 4.5, 4.6.5, 4.7 or 4.8 (7.6.3.4), or B4SOI (levels 10, 58) version 4.4 (7.6.4). All other
transistor models run as usual (without multithreading support).
If you run ./configure with --disable-openmp (or without USE_OMP preprocessor flag under
MS Windows), you will get only the standard, not paralleled BSIM3 and BSIM4 models, as has
been available from Berkeley. If OpenMP is selected and the number of threads set to 1, there
will be only a very slight CPU time disadvantage (typ. 3%) compared to the old, non OpenMP
build.

### 12.10.5 Literature

[1] R.K. Perng, T.-H. Weng, and K.-C. Li: "On Performance Enhancement of Circuit Simulation

Using Multithreaded Techniques", IEEE International Conference on Computational Science
and Engineering, 2009, pp. 158-165

## 12.11 Compatibility

ngspice is a direct derivative of spice3f5 from UC Berkeley and thus inherits all of the commands
available in its predecessor. Thanks to the open source policy of UCB (original spice3
from 1994 is still available here), several commercial variants have sprung off, either being more
dedicated to IC design or more concentrating on simulating discrete and board level electronics.
None of the commercial and almost none of the freely downloadable SPICE providers publishes
the source code. All of them have proceeded with the development, by adding functionality, or
by adding a more dedicated user interface. Some have kept the original SPICE syntax for their
netlist description, others have quickly changed some if not many of the commands, functions
and procedures. Thus it is difficult, if not impossible, to offer a simulator that acknowledges
all of these netlist dialects. ngspice includes some features that enhance compatibility that are
included automatically. This selection may be controlled to some extend by setting the compatibility
mode. Others may be invoked by the user by small additions to the netlist input file.
Some of them are listed in this chapter, some will be integrated into ngspice at a later stage,
others will be added if they are reported by users.

### 12.11.1 Compatibility mode

The variable (13.7) ngbehavior sets the compatibility mode. Per default no compatibility mode
is selected. The compatibility status will be displayed in the output window.

      set ngbehavior=ltpsa

in spinit or .spiceinit is a typical command, setting PSPICE and LTSPICE compatibility for the
whole netlist. Flag ’a’ may be combined with any of the flags listed below. By contrast

      set ngbehavior=ps

(without ’a’) will set PSPICE compatibility only for libraries which are added by a .include
command. So you may keep your Spice3 compatible netlist, but including PSPICE device
models. The available compatibility flags are:

                        Flag     Ref.           Short description
                          a               complete netlist transformed
                         ps     12.11.5      PSPICE compatibility
                         hs    12.11.10     HSPICE compatibility
                        spe     12.11.9      Spectre compatibility
                         lt     12.11.6     LTSPICE compatibility
                         s3                   Spice3 compatibility
                         ll                 all (currently not used)
                         ki     12.11.8       KiCad compatibility
                         eg                  EAGLE compatibility
                         mc                    for ’make check’
                                Table 12.2: Compatibility flags

’s3’ will disable some of the advanced ngspice features. ’eg’ will enable EAGLE compatible
voltage vector output.’mc’ is required when the command ’make check’ is to be executed.
Then all flags are reset, in addition the compatibility status output is suppressed. Flags ’ps’
and ’hs’ are mutually exclusive.
The command ’unset ngbehavior’ will remove the variable ngbehavior, thus resetting the
compatibility mode to the default (no compat mode is set).

### 12.11.2 Missing functions

You may add one or more function definitions to your input file, as listed below.

      .func LIMIT(x,a,b) {min(max(x, a), b)}
      .func PWR(x,a) {abs(x) ** a}
      .func PWRS(x,a) {sgn(x) * PWR(x,a)}
      .func stp(x) {u(x)}

### 12.11.3 Devices

#### 12.11.3.1 E Source with LAPLACE

see 5.2.5.

#### 12.11.3.2 VSwitch

The VSwitch

      S1 2 3 11 0 SW
      .MODEL SW VSWITCH(VON=5V VOFF=0V RON=0.1 ROFF=100K)

may become

      a1 %v(11) %gd(2 3) sw
      .MODEL SW aswitch(cntl_off=0.0 cntl_on=5.0 r_off=1e5
      + r_on=0.1 log=TRUE)

The XSPICE option has to be enabled.

### 12.11.4 Controls and commands

#### 12.11.4.1 .lib

The ngspice .lib command (see 2.10) requires two parameters, a file name followed by a library
name. If no library name is given, the line

      .lib filename

should be replaced by

      .inc filename

Alternatively, the compatibility mode (12.11.1) may be set to ’ps’.

#### 12.11.4.2 .incpslt

A special command to include model files is needed if the compatibility mode is set to ’hs’,
for reading data from a PDK (12.11.10), but you want to co-simulate this (integrated) circuit
together with for example a power device which has a model that requires the compatibility
mode ’pslt’. The command

      .incpslt filename

treats the included netlist from file filename, e.g. a subcircuit device model, as if its compatibility
mode had been set to ’pslt’ (12.11.7), but otherwise the netlist (including library
handling) is treated according to compatibility mode given at top level, typically ’hs’ or none.

#### 12.11.4.3 .step

Repeated analysis in ngspice is offered by a short script inside of a .control section (see Chapt.
13.8.8) added to the input file. A simple application (multiple dc sweeps) is shown below.

Input file with parameter sweep

      parameter sweep
      * resistive divider, R1 swept from start_r to stop_r
      * replaces .STEP R1 1k 10k 1k

      R1 1 2 1k
      R2 2 0 1k

      VDD 1 0 DC 1
      .dc VDD 0 1 .1

      .control
      let start_r = 1k
      let stop_r = 10k
      let delta_r = 1k
      let r_act = start_r
      * loop
      while r_act le stop_r
        alter r1 r_act
        run
        write dc-sweep.out v(2)
        set appendwrite
        let r_act = r_act + delta_r
      end
      plot dc1.v(2) dc2.v(2) dc3.v(2) dc4.v(2) dc5.v(2)
      + dc6.v(2) dc7.v(2) dc8.v(2) dc9.v(2) dc10.v(2)
      .endc

      .end

### 12.11.5 PSPICE Compatibility mode

If the variable (13.7) ngbehavior is set to ’ps’ or ’psa’ with the commands

      set ngbehavior=ps

or

      set ngbehavior=psa

in spinit or .spiceinit, ngspice will translate all files that have been read into ngspice netlist
by the .include command (ps) or the complete netlist (psa) from PSPICE syntax to ngspice.
This feature allows reading of PSPICE (or TINA) compatible device libraries (ps) that are
often supplied by the semiconductor device manufacturers. Or you may choose to use complete
PSPICE simulation decks (psa). Some ngspice input files may fail, however. For example

ngspice\examples\memristor\memristor.sp will not do, because it uses the parameter vt,
and vt is a reserved word in PSPICE.
PSPICE to ngspice translation details:

      • .model replacement in ako (a kind of) model descriptions

      • replace the E source TABLE function by a B source pwl

      • add predefined params TEMP, VT, GMIN to beginning of deck

      • add predefined params TEMP, VT to beginning of each .subckt call

      • add .functions limit, pwr, pwrs, stp, if, int

      • replace
        S1 D S DG GND SWN
        .MODEL SWN VSWITCH(VON=0.55 VOFF=0.49
        + RON={1/(2*M*(W/LE)*(KPN/2)*10)} ROFF=1G)
        by
        as1 %vd(DG GND) % gd(D S) aswn
        .model aswn aswitch(cntl_off=0.49 cntl_on=0.55
        + r_off=1G r_on={1/(2*M*(W/LE)*(KPN/2)*10)} log=TRUE)

      • replace & by &&

      • replace | by ||

      • replace T_ABS by temp and T_REL_GLOBAL by dtemp

      • get the area factor for diodes and bipolar devices
        d1 n1 n2 dmod 7 –> d1 n1 n2 dmod area=7
        q2 n1 n2 n3 [n4] bjtmod 1.35 –> q2 n1 n2 n3 n4 bjtmod area=1.35
        q3 1 2 3 4 bjtmod 1.45 –> q2 1 2 3 4 bjtmod area=1.45

      • Check for double ’{{ }}’, replace the inner ’{’, ’}’ by ’(’, ’)’

      • Limit for exp function (linear growth when exponent is larger than 14).

In ps or psa mode, ngspice will treat all .lib entries like .include. There is no hierarchically
library handling. So for reading HSPICE compatible libraries, you definitely have to unset the
ps mode, e.g. by not adding set ngbehavior=ps or disabling it by

        unset ngbehavior=ps

New analogue and digital device models from some semiconductor vendors contain the token
GND inside of their subcircuits. In the past ngspice has declared GND as global and replaced
it by 0. Now, if PS is selected, GND is not declared as global, and is not replaced inside of a
subcircuit.

### 12.11.6 LTSPICE Compatibility mode

If the variable (13.7) ngbehavior is set to ’lt’ or ’lta’ with the commands

       set ngbehavior=lt

or

       set ngbehavior=lta

in spinit or .spiceinit, ngspice will translate all files that have been read into ngspice netlist by
the .include command (lt) or the complete netlist (lta) from LTSPICE syntax to ngspice. This
feature allows reading of LTSPICE compatible device libraries or complete netlists.
Currently we offer only a subset of the documented or undocumented functions (uplim, dnlim,
uplim_tanh, dnlim_tanh). More user input is definitely required here!
This compatibility mode also adds a simple diode using the sidiode code model ( 8.2.32). The
diode model

       d1 a k ds1
       .model ds1 d(Roff=1000 Ron=0.7 Rrev=0.2 Vfwd=1
       + Vrev=10 Revepsilon=0.2 Epsilon=0.2 Ilimit=7 Revilimit=15)

is translated automatically to the equivalent code model diode

       ad1 a k ads1
       .model ads1 sidiode(Roff=1000 Ron=0.7 Rrev=0.2 Vfwd=1
       + Vrev=10 Revepsilon=0.2 Epsilon=0.2 Ilimit=7 Revilimit=15)

RKM code compatibility:

     • In LT compatibility mode ngspice will follow the RKM code notation. In addition to the
       standard notation, resistor (R) and capacitor (C) values may also be entered according to
       the following listings (the internally translated value is given after the ;):

RKM code for resistors

       R1 1 0 4K7   ; 4.7k
       R2 1 0 4R7   ; 4.7
       R3 1 0 R47   ; 0.47
       R4 1 0 470R ; 470
       R5 1 0 47K   ; 47k
       R6 1 0 47K3 ; 47.3k
       R7 1 0 470K ; 470k
       R8 1 0 4Meg7 tc1=1e-6 tc2=1e-9 dtemp=6
       *            ; 4.7Meg <-- Not defined in the RKM notation
       R9 1 0 4L7   ; 4.7m
       R10 1 0 470L ; 470m
       R11 1 0 4M7 ; 4.7m <-- This deviates fom the RKM notation

RKM code for capacitors

        C1 1 0 4p7   ; 4.7p
        C2 1 0 4n7   ; 4.7n
        C3 1 0 4u7   ; 4.7u
        C4 1 0 4m7   ; 4.7m
        C5 1 0 4F7   ; 4.7f <-- This deviates fom the RKM notation
        C6 1 0 47p3 ; 4.73p
        C7 1 0 470p ; 470p
        C8 1 0 4u76 tc1=1e-6 tc2=1e-9 dtemp=6
        *            ; 4.76u
        C9 1 0 4m7   ; 4.7m
        C10 1 0 470nF ; 470n
        C11 1 0 47fF ; 47f <-- This deviates fom the RKM notation

There are some exceptions to the RKM code notation:
      • all letters may be entered upper or lower case, and will internally be transformed to lower
        case.
      • m, M always denote milli (1e-3).
      • f, F denote femto (1e-15), fF will be again femto
      • meg, Meg denotes mega (1e6)

### 12.11.7 LTSPICE/PSPICE Compatibility mode

If the variable (13.7) ngbehavior is set to ’ltps’ or ’ltpsa’ with the commands

        set ngbehavior=ltps

or

        set ngbehavior=ltpsa

in spinit or .spiceinit, ngspice will translate all files that have been read into ngspice netlist by
the .include command (ltps) or the complete netlist (ltpsa) 12.11.6, 12.11.5 from LTSPICE and
PSPICE syntax to ngspice. This feature allows reading of LTSPICE and PSPICE compatible
device libraries or complete netlists.

### 12.11.8 KiCad Compatibility mode

KiCad will generate vector names containing ’/’. If the variable (13.7) ngbehavior is set to ki
with the command

        set ngbehavior=ki

is set in .spiceinit (or plot line flag kicad is given 13.5.55), ngspice will place " around this
vector name. The mathematical operation ’division’ in the plot command will then work only
if spaces are placed around the division operator /.
12.12. TRANSIENT SIMULATION TIME STEPS WITH VOLTAGE-BASED TRUNCATION ERROR CORR

### 12.11.9 Spectre Compatibility mode

If the variable (13.7) ngbehavior is set to spe with the command

      set ngbehavior=spe

is set in .spiceinit Spectre compatibility mode is enabled. True compatibility today is still
far away. The only action available for now is the use of the MOS device instance parameter
nf. If nf is given and larger than 1 and Spectre (or HSPICE) compatibility is enabled, nf is
used as a divisor to the transistor width W given on the instance line. The resulting W/nf is now
used to select the suitable device model in the binning process. This procedure is of interest for
a multi-gate transistor, which has a total width of W, but each finger is model according to the
model given for W/nf.

### 12.11.10 HSPICE Compatibility mode

If the variable (13.7) ngbehavior is set to hs with the command

      set ngbehavior=hs

given in .spiceinit (12.6), HSPICE compatibility mode is enabled. This mode allows to read
libraries with the .lib command in a recursive fashion, as is required by HSPICE compatible
process development kits (PDKs). In addition the nf flag is enabled, as described in 12.11.9 .

## 12.12 Transient simulation time steps with voltage-based trun-

            cation error correction
Traditionally Spice3f5 and ngspice use a charge-based truncation error correction, while calculating
the next time step in a transient simulation. As this is a central procedure determining
the simulation speed and convergence behavior, ngspice now also offers an alternative voltagebased
method. It requires ngspice compiled with the -enable-predictor flag (which is the
default) and may be selected by setting option newtrunc in .spiceinit (12.6).
Example .spiceinit settings:

      option newtrunc
      option ltetrtol=900 ; optimum: 400-500 for gear, 800 for trap
      option ltereltol=1e-3 ; default is 1e-3
      option lteabstol=1e-6 ; default is 1e-6

The options ltetrtol, ltereltol, and lteabstol have their usable meanings, comparable
to their standard counterparts (see 11.1.2), but may differ in the values selected.
This new feature is currently largely unexplored, will need theoretical and practical backings,
but may offer further optimization of the transient simulation.

## 12.13 Server mode option -s

A program may write the SPICE input to the console. This output is redirected to ngspice via
‘|’. ngspice called with the -s option writes its output to the console, which again is redirected
to a receiving program by ‘|’. In the following simple example cat reads the input file and
prints it content to the console, which is redirected to ngspice by a first pipe, ngspice transfers
its output (similar to a raw file, see below) to less via another pipe.
Example command line:

      cat input.cir|ngspice -s|less

Under MS Windows you will need to compile ngspice as a console application (see Chapt.
28.2.4) for this server mode usage.
Example input file:

      test -s
      v1 1 0 1
      r1 1 0 2k
      .options filetype=ascii
      .save i(v1)
      .dc v1 -1 1 0.5
      .end

If you start ngspice console with

      ngspice -s

you may type in the above circuit line by line (not to forget the first line, which is a title and
will be ignored). If you close your input with ctrl Z, and return, you will get the following
output (this is valid for MINGW only) on the console, like a raw file:

      Circuit: test -s

      Doing analysis at TEMP = 27.000000 and TNOM = 27.000000

      Title: test -s
      Date: Sun Jan 15 18:57:13 2012
      Plotname: DC transfer characteristic
      Flags: real
      No. Variables: 2
      No. Points: 0
      Variables:
      No. of Data Columns : 2
      0 v(v-sweep) voltage
      1 i(v1) current
      Values:
      0   -1.000000000000000e+000

         5.000000000000000e-004
      1   -5.000000000000000e-001
         2.500000000000000e-004
      2    0.000000000000000e+000
         0.000000000000000e+000
      3    5.000000000000000e-001
        -2.500000000000000e-004
      4    1.000000000000000e+000
        -5.000000000000000e-004
      @@@ 122 5

The number 5 of the last line @@@ 122 5 shows the number of data points, which is missing in
the above line No. Points: 0 because at the time of writing to the console it has not yet
been available.
ctrl Z is not usable here in Linux, a patch to install ctrl D instead is being evaluated.

## 12.14 Pipe mode option -p

A program may write a set of ngspice commands (see 13.5) to the console. This output is redirected
to ngspice via ‘|’. ngspice called with the -p option immediately executes the commands
and then exits. In the following simple example cat reads the input file and prints it content to
the console, which is redirected to ngspice by a pipe, ngspice executes the commands.
Example command line:

      cat pipe-circuit.cir | ngspice -p

Under MS Windows you will need to compile ngspice as a console application (see Chapt.
28.2.4) for this pipe mode usage.
Example input file:

      *pipe-circuit.cir
      source circuit.cir
      tran 10u 2m
      write pcir.raw all

Example circuit file:

      * Circuit.cir
      V1 n0 0 SIN(0 10 1kHz)
      C1 n1 n0 3.3nF
      R1 0 n1 1k
      .end

The raw file pcir.raw will contain the final simulation results.

## 12.15 Ngspice control via input, output fifos

Example bash script:

      #!/usr/bin/env bash

      NGSPICE_COMMAND="ngspice"

      rm input.fifo
      rm output.fifo

      mkfifo input.fifo
      mkfifo output.fifo

      $NGSPICE_COMMAND       -p -i <input.fifo >output.fifo &

      exec 3>input.fifo
      echo "I can write to input.fifo"

      echo "Start processing..."
      echo ""

      echo "source circuit.cir" >&3
      echo "unset askquit" >&3
      echo "set nobreak" >&3
      echo "tran 0.01ms 0.1ms">&3
      echo "print n0" >&3
      echo "quit" >&3

      echo "Try to open output.fifo ..."
      exec 4<output.fifo
      echo "I can read from output.fifo"

      echo "Ready to read..."
      while read output
      do
            echo $output
      done <&4

      exec 3>&-
      exec 4>&-

      echo "End processing"

The bash script listed above (tested under Linux and Cygwin)
- launches ngspice in pipe mode (-p) in another thread.
- writes some commands to the ngspice input

- runs ngspice with the tran command
- reads the output and prints it onto the console.
The input file with a small circuit is:
Circuit.cir :

      * Circuit.cir
      V1 n0 0 SIN(0 10 1kHz)
      C1 n1 n0 3.3nF
      R1 0 n1 1k
      .end

## 12.16 Tests

The ngspice distribution is accompanied by a suite of test input and output files, located in the
directory ngspice/tests. Originally this suite was meant to see if ngspice with all models was
made and installed properly. It is started by
$ make check

from within your compilation and development shell. A sequence of simulations is thus started,
its outputs compared to given output files by comparisons string by string. This feature is momentarily
used to check for some basic procedures and the XSPICE extension (8) as a regression
test. Several other input files located in directory ngspice/tests may serve as light-weight
examples for invoking devices and simple circuits.
Today’s very complex device models (BSIM3 (7.6.3.3), BSIM4 (see 7.6.3.4), HiSIM (see 7.6.6)
and others) require a different strategy for verification. Under development for ngspice is the
CMC Regression test by Colin McAndrew, which accompanies every new model. These tests
cover a large range of different DC, AC and noise simulations with different geometry ranges
and operating conditions and are more meaningful the transient simulations with their step size
dependencies. A major advantage is the scalability of the diff comparisons, which check for
equality within a given tolerance. A set of Perl modules cares for input, output and comparisons
of the models. Currently BSIM3, BSIM4, BSIMSOI4, HICUM2, HiSIM, and HiSIM_HV
models implement the QA test. You may invoke it by running the command given above or by
$ make -i check 2>&1 | tee results

-i will cause make to ignore any errors, and tee will provide console output as well as printing
to file ’results’. Be aware that under MS Windows you will need the console binary (see 28.2.4)
to run the CMC tests, and you have to have Perl installed!
As these tests may consume a considerable amount of CPU time, there is a configure option
--enable-shortcheck 28.1.8.1 available, providing a strongly reduced runtime, because besides
some regression tests only BSIM3 and BSM4 devices are checked.
Other tests have been developed, there are also some benchmark circuit compilations available.
Please have a look at our Tests and Quality Assurance web page.

## 12.17 Tools for debugging a circuit netlist

This a chapter only in its initial state. Not all circuits will simulate immediately and easily. The
netlist may contain a bug. The netlist may be o.k., but then ngspice may not find an operating
point. If the operating point has been found, the transient simulation will just yield the famous
error message ’transient time step too small’. Unfortumately there are many reasons for failure,
on the other hand there is a lot of literature available to traet non-convergence.
So for now there will be listed here only a few ’tools’ offered by ngspice to aid debugging.

### 12.17.1 options and initial conditions

If ngspice has trouble finding the operating point, setting some initial conditions by adding
.nodeset (11.2.1) or .ic (11.2.2) for critical nodes may help. The variation of some op option
parameters may help as well (see 11.1.2). If there are nodes without dc connection to ground
(e.g. two capacitors in series connection), finding the operating point will fail. Here the option
RSHUNT may be of help by adding are (typically large) resistor from each node to ground.
Convergence may be improved by the RSERIES option that add a (typically small) resistor in
series to each inductor.
Transient simulations are governed by another set of options (see 11.1.4). Careful variation of
the parameters, as described in the literature, may enable convergence in incritical situations
(not guaranteed, however).

### 12.17.2 set debug

If set in .spiceinit (or spice.rc), the command set debug will yield an analysis of each command
which is run from .spiceinit and .control.

### 12.17.3 set ngdebug

The command set ngdebug, if set in .spiceinit (spice.rc) provides some additional warning
messages. If ngspice has write access to the current directory, 3 or 4 files are saved to that
directory, showing the netlist at specific stages during parsing. Each file contain two parts,
the netlist without comment lines, followed by the same netlist including all comment lines.
debug-out.txt is available after pre-processing the netlist. debug-out2.txt shows the netlist
after parameter and subcircuit expansion. debug-out3.txt lists the final netlist. debug-outmc.txt
is issued, when the netlist is reloaded after a reset or mc_source command.
During a transient simulation a vector ’speedcheck’ is generated in the current tran plot. The
independent variable is the scale vector ’time’, the dependent variable is the wall clock time
with a resolution of about 100 ms. So you may monitor the simulation progress of a (lengthy)
transient simulation and detect critical (simulated) times where the simulation may be slowed
down.
Another vector ’deltacheck’ is generated in the current tran plot. The independent variable is
again the scale vector ’time’, the dependent variable is the time delta between the accepted time
points. This is another way to monitor the simulation progress of a transient simulation and

allows to detect critical circuit conditions (e.g. when small deltas are clustered at a specific time
step).
When ngspice is used as a shared library (15), the complete netlist sent to ngspice by the calling
process is returned to the caller by the callback function printfcn. Also return each command
received by the caller.

### 12.17.4 miscellaneous

Debugging the equations of a B source are described in chapt. 5.4.
Compiling ngspice with the ./configure flag --enable-ftedebug or (for MS Visual Studio:
adding a preprocessor flag FTEDEBUG) will enable some additional warning messages.
Compiling ngspice with the ./configure flag --enable-stepdebug or (for MS Visual Studio:
adding a preprocessor flag STEPDEBUG) yields a very powerful tool for analysing the steps of
a transient simulation. The amount of messages printed however is overwhelming and may be
interpreted by an insider only.

## 12.18 Reporting bugs and errors

Ngspice is a complex piece of software. The source code contains over 1500 files. Various
models and simulation procedures are provided, some of them not used and tested intensively.
Therefore errors may be found, some still evolving from the original spice3f5 code, others
introduced during the ongoing code enhancements.
If you happen to experience an error during the usage of ngspice, please send a report to the
development team. Ngspice is hosted on SourceForge, the preferred place to post a bug report
is the ngspice bug tracker. We would prefer to have your bug tested against the actual source
code available at Git, but of course a report using the most recent ngspice release is welcome!
Please provide the following information with your report:
Ngspice version
Operating system
Small input file to reproduce the bug
Actual output versus the expected output
