# 28 Compilation notes

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

This file describes the procedures to install ngspice from sources.
Some special considerations are required when Verilog-A models are to be included (see chapter
9.2).

## 28.1 Ngspice Installation under Linux (and other ’UNIXes’)

### 28.1.1 Prerequisites

Ngspice is written in C and thus a complete C compilation environment is needed. Ngspice is
developed on GNU/Linux with autotools, gcc, and GNU make.
The following software must be installed in your system to compile ngspice: bison, flex, and
X11 (and Xaw, Xmu, Xext, Xft, FontConfig, Xrender, and freetype) headers (e.g. libX11-
devel) and libs (e.g. libX11-6).
The X11 headers and libraries are typically available in an X11 development package from your
Linux distribution.
If you want to compile the source code from Git, you will need additional software: autoconf,
automake, libtool.
For your convenience you always should add readline (or editline) libs and headers.
If you intend to make tclspice (see chapt. 16), you will need tcl/tk and blt.
If you want to have high performance and accurate FFT’s you should install: fftw-3. The
ngspice configure script will find the library and will induce the build process to link against it.
For soundfile (*.wav) support install libsndfile and libsamplerate (including their headers).

### 28.1.2 Install from Git

This section describes how to install from source code taken direct from Git. This will give
you access to the most recent enhancements and corrections. However be careful as the code
in Git may be under development and thus still unstable. For user install instructions using

source from released distributions, please see the sections titled ’Install from tarball’ (28.1.3)
and ’Advanced Install’ (28.1.8).
Download source from Git as described on the sourceforge ngspice Git page. Define and enter
a directory of your choice, e.g. /home/myname/software/. Download the complete ngspice
repository from Git, for example by anonymous access issuing the command

      git clone git://git.code.sf.net/p/ngspice/ngspice

or via http protocol

      git clone http://git.code.sf.net/p/ngspice/ngspice

You will find the sources in directory /home/myname/software/ngspice. Now enter the
ngspice top level directory ngspice (where the installation instruction file INSTALL can be
found).
The project uses the GNU build process. You should be able to do the following:
$ ./compile_linux.sh

This script will run autogen.sh, create a release directory, run ../configure, clean, make
and make install, all with suitable parameters to compile a 64 bit version of ngspice, including
the XSPICE code models.
A suitable manual approach for compiling (without release directory) might be:
$ ./autogen.sh

$ ./configure --with-x CFLAGS="-m64 -O2" LDFLAGS="-m64 -s"

$ make clean

$ make

$ sudo make install

See the section titled ’Advanced Install’ (28.1.8) for instructions about arguments that can be
passed to ./configure to customize the build and installation. CIDER is optional, as well as
the X11 plot interface. Both are included and used in ./compile_linux.sh:
--enable-cider Include CIDER numerical device simulator (see Chapt. 26).

--with-x Include the X11 graphics interface.

Starting with ngspice-43, the following options are included automatically: XSPICE (for XSPICE
extensions, see chapters 8 and 24), KLU (KLU matrix solver in addition to Sparse 1.3), readline,
OpenMP (parallel model evaluation for selected device models), FFTW3 (use the fftw3 fast
Fourier library) and OSDI (interface for loading Verilog-A compact device models compiled by
OpenVAF (see 9.2)). These options may be de-selected, if not required:
--disable-xspice

--disable-klu

--with-readline=no If readline is not available, editline may be used.

--disable-openmp

--disable-osdi
--with-fftw3=no
It is however recommended to keep the options, as they enhance ngspice capabilities significantly.
Soundfile support is disabled automatically when its libraries and headers are not found.
CFLAGS="-m64 -O2" LDFLAGS="-m64 -s" will enable a 64 bit build (-m64) and stress the
optmisation (-O2). -s will yield a minimum size executable (debug information stripped). On
most systems --disable-debug will have the same effect. A 32bit build can be made if all 32
bit tools (compiler etc.) are installed and -m32 is given instead of -m64. This is however not
tested anymore, as 64 bit system prevail.
$make clean may sometimes help avoiding mixing up old and newly created object files.
For your convenience a shell script compile_linux.sh is available in ngspice directory. to be
started with ./compile_linux.sh <d> (d is optional for the debug build).
If a problem is found with the build process, please submit a report to the Ngspice development
team. Please provide information about your system and any ./configure arguments you
are using, together with any error messages. Ideally you would have tried to fix the problem
yourself first. If you have fixed the problem then the development team will love to hear from
you.
If you need updating your local source code tree from Git, just enter the ngspice directory and
issue the command

      git pull

git pull will not overwrite modified files in your working directory. To drop your local
changes first, you can run

      git reset --hard

To learn more about Git, which can be both powerful and difficult to master, please consult
http://git-scm.com/, especially: http://git-scm.com/documentation, which has links to documentation
and tutorials.

### 28.1.3 Install from a tarball, e.g. from ngspice-47.tar.gz

This covers installation from a tarball (for example ngspice-39.tar.gz, to be found at http://sourceforge.net/pro
spice-rework/43/). After downloading the tar ball to a local directory unpack it using:
$ tar -zxvf ngspice-47.tar.gz
Now change directories in to the top-level source directory (where this text from the INSTALL
file can be found).
You should be able to do:
$ ./configure --with-x11
$ make clean
$ make

$ sudo make install
The default install dir is /usr/local/bin
See the section titled ’Advanced Install’ (28.1.8) for instructions about arguments that can be
passed to ./configure to customize the build and installation.

### 28.1.4 Compilation using an user defined directory tree for object files

The procedures described above will store the *.o files (output of the compilation step) into the
directories where the sources (*.c) are located. This may not be the best option if you want for
example to maintain a debug version and in parallel a release version of ngspice (./configure
--disable-debug). So if you intend to create a separate object file tree like ngspice/ngbuild/release,
you may do the following, starting from the default directory ngspice:
mkdir -p release
cd release
../configure --with-x11 <more options>
make install
This will create an object file directory tree, similar to the source file directory tree, the object
files are now separated from the source files. For the debug version, you may do the same as
described above, replacing ’release’ by ’debug’, and obtain another separated object file directory
tree. If you already have run ./configure in ngspice, you have to do a maintainer-clean,
before the above procedure will work. The script ./compile_linux.sh is made according to
the procedure described above.

### 28.1.5 ngspice as a shared library

From the tarball (for example ngspice-44.tar.gz, see above), with the GNU build process and
the following options selected:
$ ./configure --with-ngshared --enable-cider
$ make clean
$ make
$ sudo make install
you will get the ngspice shared library. A file ngspice.pc for pkg-config is generated.
$make clean may sometimes help avoiding mixing up old and newly created object files. It is
required if you make both shared and standard ngspice from the same setup.
With sources from git you have to do:
$ ./autogen.sh
$ ./configure --with-ngshared --enable-cider
$ make clean
$ make
$ sudo make install

### 28.1.6 Relative paths for spinit and code models

The ./configure option
$ ./configure --enable-relpath
deserves some extra mentioning:
It sets relative search paths for the file spinit and the XSPICE code models *.cm. spinit will
be look up in ../share/ngspice/scripts. The search path for the code models (as set by
the parameter to the codemodel command in spinit) is set to ../lib/ngspice. The binary is
found in ../bin. All these paths are relative to the current directory. Under MS Windows, this
is the directory of ngspice.exe as per default, but may be set to any other directory with the cd
(chapt. 13.5.12) command.
The install path for the ngspice executable is determined by the --prefix flag of ./configure.
The current directory for the ngspice shared library is determined by the calling program.

### 28.1.7 Installation on Red Hat or Oracle Linux (and similar, e.g. Centos)

These OSs, widely distributed among commercial users, require some special considerations.
There is an extra document, NGSPICE on Red Hat Like Distributions.pdf, provided by Justin
Fisher, available with the ngspice distribution.

### 28.1.8 Advanced Install

Some extra options can be provided to ./configure. To get all available options do:
$ ./configure --help
Some of these options are generic to the GNU build process that is used by Ngspice, other are
specific to Ngspice.
The following sections provide some guidance and descriptions for many, but not all, of these
options.

#### 28.1.8.1 Options Specific to Using Ngspice

Already included options:
--enable-openmp Compile ngspice for multi-core processors. Paralleling is done by OpenMP
(see Chapt. 12.10).
--enable-xspice Enable XSPICE enhancements, yielding a mixed signal simulator integrated
into ngspice with codemodel dynamic loading support. See Chapt. 8 and section II for details.
--enable-osdi Enable the OSDI interface for loading Verilog-A compact device models compiled
by OpenVAF (see 9.2)
--enable-klu Enable the KLU matrix solver
--with-readline=yes Enable GNU readline support for the command line interface.
User-selectable options:

--enable-cider Cider is a mixed-level simulator that couples Spice3 and DSIM to simulate
devices from their technological parameters. This part of the simulator is not compiled in by
default.
--with-editline=yes Enables the use of the BSD editline library (libedit).
See http://www.thrysoee.dk/editline/. To be used in addition with switching off readline by
--with-readline=no.

--without-x Disable the X-Windows graphical system. Compile without needing X headers
and X libraries. The plot command (13.5.55) is now disabled. You may use Gnuplot (13.5.38)
or pyplot instead.
--with-tcl=tcldir When configured with this option the tcl module ‘tclspice’ is compiled
and installed instead of plain ngspice.
--with-ngshared This option will create a shared library (*.so in Linux) or dynamic link
library (*.dll) instead of plain ngspice.
--enable-relpath This options introduces a search path for spinit relative to the calling executable
(ngspice or the caller using the ngspice shared library) as ../share/ngspice. In spinit
the search path for code models is also set as relative as ../lib. This option may be effective
especially when not using standard installation paths in Linux, but especially for ngspice.dll
under MS Windows, if to be installed in other directories than in C:\Spice64.
--disable-debug This option will remove the ’-g’ option passed to the compiler. This speeds
up execution time, creates a small executable, and is recommended for normal use. If you want
to run ngspice in a debugger (e.g. gdb), you should not select this option.
--enable-pss This is an experimental feature to enable Periodic Steady State Analysis.

--enable-oldapps Beginning with ngspice-28, only ngspice executable is made. If you need
old apps like ngmakeidx, ngmultidec, ngproc2mod, ngsconvert, use this ./configure flag. ngnutmeg
is no longer made due to incompatibilities, its functions are available by plain ngspice.
--with-fftw3=no Do not check for and use the fftw fast fourier transform library (www.fftw.org).
Use an internal fft algorithm instead. Default is yes.
--disable-utf8 Switch off UNICODE support, use extended ASCII with Western character
support instead.
--disable-sp Switch off RF support: no integrated S-parameter simulation, no RF noise simulation
(11.3.8).
--enable-shortcheck Enables a ’make check’ with strongly reduced runtime. Besides some
regression tests only BSIM3 and BSM4 devices are checked.

#### 28.1.8.2 Options for experimental usage only

The following options are seldom used today, not tested, some may even no longer be implemented
(correctly) and lead to errors.
--enable-capbypass Bypass calculation of cbd/cbs in the mosfets if the vbs/vbd voltages are
unchanged.
--enable-capzerobypass Bypass all the cbd/cbs calculations if Czero is zero. This is enabled
by default since rework-18.

--enable-expdevices Enable experimental devices. This option is used by developers to
mask devices under development. Almost useless for users.
--enable-experimental This may be used to enable some experimental code. The code
has to be encapsulated into #ifdef EXPERIMENTAL_CODE ... #endif constructs. Currently
there is no such code available.
--enable-help Force building nghelp. This is deprecated.

--enable-newpred Enable the NEWPRED symbol in the code.

--enable-nodelimiting Experimental damping scheme

--enable-nobypass Don’t bypass recalculations of slowly changing variables

--enable-nosqrt Use always log/exp for non-linear capacitances

--enable-predictor Enable a predictor method for convergence

--enable-sense2 Use spice2 sensitivity analysis

#### 28.1.8.3 Options useful only for debugging specific issues in ngspice

The following options are seldom used today, not tested, some may even no longer be functional
or implemented. Only experienced users should switch on these options, often they are effective
only in conjunction with looking at the respective source code.
--enable-ansi Configure will try to find an option for your compiler so that it expects ansi-C.

--enable-asdebug Debug sensitivity code *ASDEBUG*.

--enable-blktmsdebug Debug distortion code *BLOCKTIMES*

--enable-checkergcc Option for compilation with checkergcc.

--enable-cpdebug Enable ngspice shell code debug.

--enable-ftedebug Enable ngspice frontend debug.

--enable-gc Enable the Boehm-Weiser Conservative Garbage Collector.

--enable-pzdebug Debug pole/zero code.

--enable-sensdebug Debug sensitivity code *SENSDEBUG*.

--enable-smltmsdebug Debug distortion code *SMALLTIMES*

--enable-smoketest Enable smoketest compile.

--enable-stepdebug Turns on debugging of convergence steps in transient analysis

#### 28.1.8.4 Compilers and Options

Some systems require unusual options for compilation or linking that the configure script does
not know about. You can give configure initial values for variables by setting them in the
environment. Using a Bourne-compatible shell, you can do that on the command line like this:
CC=c89

CFLAGS=-O2

LIBS=-lposix
./configure
Or on systems that have the env program, you can do it like this:
env CPPFLAGS=-I/usr/local/include
LDFLAGS=-s
./configure

#### 28.1.8.5 Installation Names

By default, make install will install the package’s files in /usr/local/bin, /usr/local/man, etc.
You can specify an installation prefix other than /usr/local by giving configure the option
–prefix=PATH.
You can specify separate installation prefixes for architecture-specific files and architectureindependent
files. If you give configure the option –exec-prefix=PATH, the package will use
PATH as the prefix for installing programs and libraries. Documentation and other data files
will still use the regular prefix.
In addition, if you use an unusual directory layout you can give options like –bindir=PATH
to specify different values for particular kinds of files. Run configure –help for a list of the
directories you can set and what kinds of files go in them.
If the package supports it, you can cause programs to be installed with an extra prefix or suffix
on their names by giving configure the option –program-prefix=PREFIX or –programsuffix=SUFFIX.
When installed on MinGW with MSYS alternative paths are not fully supported. See ‘How to
make ngspice with MINGW and MSYS’ (28.2.2) for details.

#### 28.1.8.6 Optional Features

Some packages pay attention to –enable-FEATURE options to configure, where FEATURE
indicates an optional part of the package. They may also pay attention to –with-PACKAGE
options, where PACKAGE is something like gnu-as or ‘x’ (for the X Window System). The
README should mention any –enable- and –with- options that the package recognizes.
For packages that use the X Window System, configure can usually find the X include and
library files automatically, but if it doesn’t, you can use the configure options –x-includes=DIR
and –x-libraries=DIR to specify their locations.

## 28.2 Ngspice Compilation under Windows OS

### 28.2.1 Building ngspice with MS Visual Studio 2022/2026

ngspice may be compiled and linked with MS Visual Studio 2022 or 2026. Version 2019 is
not compatible with the new OSDI interface. A free version is offered by Microsoft as the
Visual Studio Community Edition. XSPICE project files are located in visualc/XSPICE and

are automatically invoked if you start the build procedure. The projects are in the format for
Visual Studio 2022, but any later version of Visual Studio can upgrade the projects to its newer
version. In addition you will need to install FLEX and BISON (see below). Using FFTW-3 is
optional and requires a special VS project file (see below).

OSDI, KLU, CIDER, OpenMP and XSPICE are included, as well as the code models for
XSPICE (*.cm).

After compilation the executable, code models and initialization files are available in directory
C:\ as C:\Spice, C:\Spice64, C:\Spice64, or C:\Spice64d, depending on 32 or 64 bit and release
or debug. However, 32-bit is no longer supported, compilation may fail in future releases.
A typical installation tree (64-bit, release) is shown below. A true Windows installer is however
not yet available. The project’s ’home’ directory for Windows OS (ngspice/visualc) with
its files vngspice.sln (solution) and vngspice.vcxproj (project) allows compiling and linking
ngspice with MS Visual Studio.

On Windows 10 with its strict security model, some complications will arise. A normal user is
not allowed to create directories in C:\. You will need admin access rights. So how to cope with
this situation? Three different methods are listed below:

    • Open and run Visual Studio as admin.

    • Create the directories C:\Spice64, or C:\Spice64d as admin and give them full access
      rights for the ordinary user.

    • Select another storage place (e.g. D:\) to install the ngspice tree. To allow this, edit files
      make-install-vngspice.bat (for 32 and 64 bit release) or make-install-vngspiced.bat
      (for 32 or 64 bit debug), found in ngspice\visualc, and change lines 10 (set dst=c:\Spice)
      and 40 to the new destination.

/visualc/src/include/ngspice contains a dedicated config.h file with the preprocessor definitions
required to properly compile the code.

Install Microsoft Visual Studio 2022 with its C/C++ option. The MS Visual Studio Community
Edition (which is available at no cost from https://www.visualstudio.com/) is fully adequate. It
will generate a 64 bit Release with or without OpenMP support and a Debug version of ngspice,
using the x64 flag. In addition you may select a console version without graphics interface.
Making ngspice with 32 bit is still possible, but is not recommended. 32 bit is available with
flag Win32. Standard for everyday use are the ReleaseOMP variants (GUI or console) for 64
bit.

Compilation of the ngspice and XSPICE codes requires the installation of FLEX and BISON.
They may be downloaded as Windows executables from winflexbison. Please unzip the zip
file and copy its content into a directory named flex-bison at the same level as the ngspice
directory. The resulting source tree then is:

      D:\MySpiceSources\
          ngspice\
              visualc\
                  vngspice.vcxproj
              ...
          flex-bison\
              win_bison.exe
          ...

                       Table 28.1: ngspice source tree under MS Windows

Procedure:

Download ngspice. You may obtain a snapshot from ngspice git page at SourceForge, where
you will find on top of the page a link named ’Download Snapshot’. On the left you may select
any of the branches which are of interest. Branch ’master’ is the most mature code selection,
branch ’pre-master’ is an actual development branch. Another approach is to install ’git’ from
git for Windows and installing ngspice source code with the command

      git clone git://git.code.sf.net/p/ngspice/ngspice

as described in chapter 28.1.2.

Go to directory /ngspice/visualc.

Start MS Visual Studio as admin if you need to create C:\Spice64 etc and open the input
file vngspice.sln. Or start MS Visual Studio by double click on vngspice.sln if C:\Spice64
etc. already exist or your have selected any other accessible stroage location (see comment
from above). After MS Visual Studio opens, select the debug or release version (with or without
OpenMP support) by checking Build, Configuration-Manager, Debug, Release or ReleaseOMP.
Start making ngspice.exe by selecting Build and Build Solution. The executable
will be created and stored in visualc/vngspice/<configuration.platform>. Object files will
be stored to visualc/vngspice/<configuration.platform>/obj. The debug version of the executable
(and code models) are made available in C:\Spice64d.

A simplified installation tree is created in parallel:

C:\Spice64\
  bin\
     ngspice.exe
     vcomp14xx.dll
  lib\
     ngspice\
       analog.cm
       digital.cm
       spice2poly.cm
       extradev.cm
       extravt.cm
       table.cm
       ivlng.dll
       ivlng.vpi
  share\
     ngspice\
       scripts\
          spinit
          MSVC.CMD
          ghnggen
          vlnggen

             Table 28.2: ngspice Visual Studio installation tree under MS Windows

The exact directory names depend on the configuration and platform you have selected (C:\Spice,
C:\Spice64, C:\Spiced, C:\Spice64d). If you intend to install ngspice into another directory,
e.g. D:\MySpice, you may simply copy the contents from C:\Spice to the new location. This
becomes possible because the paths to the code models or spinit are set relative to ngspice.exe.
As an alternative, you may edit make-install-vngspice.bat and alter the following entries
from:
set dst=c:\Spice
set dst=c:\Spice64
to
set dst=D:\MySpice
set dst=D:\MySpice64
To use the FFTW-3 library for a ’calibrated’ fast Fourier analysis with the fft command (see
13.5.33), download the precompiled MS Windows FFTW distribution (64 bit) from the Windows
download page. Extract at least the files fftw3.h, libfftw3-3.def, and libfftw3-3.dll to
directory ../../fftw-3.3-dll64 (from 64 bit fftw3 for ngspice 64 bit), so that the directory is at the
same level as the ngspice directory. Then select the MS VC++ project file visualc/vngspicefftw.vcxproj
for starting VC++, select the appropriate configuration and platform, and off you
go.
For soundfile (*.wav) support download linsndfile. Expand libsndfile-1.2.2-win64 into same
level as ngspice, rename the directory to libsndfile. Then download libsamplerate and expand
libsamplerate-0.2.2-win64 into same level as ngspice, rename the directory to libsamplerate.This
is how the complete development directory tree looks like:

       D:\Spice_dev\
           fftw-3.3-dll64\
               fftw3.h
               ...
           flex-bison\
               win_bison.exe
               ...
           libsamplerate\
               bin\
               ...
           libsndfile\
               bin\
               ...
           ngspice\
               src\
               ...
               visualc\
                   src\
                       include\
                           ngspice\
                               config.h
                   ...
                   vngspice-fftw.sln
                   vngspice-fftw.vcxproj
                   ...

      Table 28.3: ngspice source tree under MS Windows (including fftw and wav support)

Editing config.h will allow disabling of features, e.g. removing soundfile support by undefining
flags HAVE_LIBSNDFILE and HAVE_LIBSAMPLERATE.
If you use the debugging features of Visual Studio, ngspice is started with a special spinit file
located in visualc\vngspice\share\ngspice\scripts. Your user-defined start-up commands are
best addressed in a .spiceinit file located in C:\users\<username>.
For compiling ngspice as a dll (shared library) there is a dedicated project file coming with the
source code to generate ngspice.dll. Go to the directory visualc and start the project with
double clicking on sharedspice.vcxproj.

### 28.2.2 How to make ngspice with MINGW and MSYS2

Creating ngspice with MINGW is a straightforward procedure, if you have MSYS2 and MINGW
installed properly. Go to https://www.msys2.org/ and install the 64-bit version of MSYS2, e.g.
to C:\msys64. There are now several ways to move on. A very nice description of the installation
procedure for all the tools required to compile some source code is given in this link. In
addition to the compiler gcc you will need the packages libtool, autoconf, automake, bison, git,
make, and optional fftw, libsndfile, and libsamplerate.

64-bit ngspice is now the standard, making 32-bit ngspice is still possible if a suitable gcc
and 32-bit libraries are installed, but is not tested any more. The procedure of compiling a
distribution (for example, the most recent stable distribution from the ngspice website, e.g.
ngspice-47.tar.gz), is as follows:
$ cd ngspice
$ mkdir release
$ cd release
$ ../configure --with-wingui ...and other options (28.1.8.1)
$ make
$ make install
The useful options to ../configure are
--enable-cider
--disable-debug (-O2 optimization, no debug information), as XSPICE, OSDI, KLU, OpenMP
are already included.
An option to make is
-j8
If you have a processor with 8 real cores, this will speed up compilation considerably.
A complete ngspice (release version, no debug info, 64-bit optimized executable) may be made
available just by
$ cd ngspice
$ ./compile_min.sh
A debug version without optimization will be available by
$ ./compile_min.sh d
Options used in the script:
CIDER may be selected, XSPICE, KLU, and OpenMP deselected (only if really necessary).
–disable-debug will give O2 optimization (versus O0 for debug) and removes all debugging
info.
The install script will copy all files to C:\Spice64, the code models for XSPICE will be stored
in C:\Spice64\lib\spice.
If you don’t use the tarball, you may download the ngspice source code from the ngspice Git
distribution as described on the sourceforge ngspice Git page. Define and enter a directory of
your choice, e.g. /d/spice/. Download the complete ngspice repository from Git, for example
by anonymous access issuing the command

      git clone git://git.code.sf.net/p/ngspice/ngspice

You will find the sources in directory /d/spice/ngspice/. Now enter the ngspice top level
directory ngspice. For compilation using
$ ./compile_min.sh

you have to edit this script and uncomment the two lines enabling ./autogen.sh. If you want
to compile ngspice manually, follow the procedure described below:

$ cd ngspice

$ ./autogen.sh

$ mkdir release

$ cd release

$ ../configure --with-wingui ...and other options (28.1.8.1)

$ make -j8

$ make install

The user defined build tree saves the object files, instead of putting them into the source tree, in
a release (and a debug) tree. Please see Chapt. 28.1.4 for instructions.

If you need updating your local source code tree from Git, just enter ngspice directory and
issue the command

      git pull

git pull will not overwrite modified files in your working directory. To drop your local
changes first, you can run

      git reset --hard

To learn more about Git, which can be both powerful and difficult to master, please consult
http://git-scm.com/, especially: http://git-scm.com/documentation, which has pointers to documentation
and tutorials.

The script ./compile_min.sh or the command make install will create a directory tree with
64-bit ngspice as shown below:

C:\Spice64\
  bin\
     ngspice.exe
     cmpp.exe
  lib\
     ngspice\
       analog.cm
       digital.cm
       spice2poly.cm
       extradev.cm
       extravt.cm
  share\
     info\
       dir
       ngspice.info
       ngspice.info-1
       ..
       ngspice.info-10
     man\
       man1\
          ngspice.1
     ngspice\
       scripts\
          ciderinit
          devaxis
          devload
          setplot
          spectrum
          spinit
          MSVC.CMD
          vlnggen

               Table 28.4: ngspice standard installation tree under MS Windows

The ./configure flag --enable-relpath may be useful if the install path (e.g. C:\Spice64) is
only preliminary, because a Windows installer is preferred. Then all search paths for spinit and
code models are made relative to the executable (either ngspice.exe or the caller to ngspice.dll),
see 28.1.8.
For compiling ngspice as a dll (shared library) use the configure option --with-ngshared instead
of --with-wingui. In addition you might add (optionally) --enable-relpath to avoid
absolute paths when searching for code models. You may edit compile_min.sh accordingly
and compile using this script in the MSYS2 window.

### 28.2.3 make ngspice with pure CYGWIN

The procedure of compiling is the same as with Linux (see Chapt. 28.1). After you have moved
to the ngspice directory, the following command sequence may do the work for you:

$ ./autogen.sh
$ mkdir release-cyg
$ cd release-cyg
$ ../configure --with-x --enable-pss --enable-cider
$ make clean 2>&1 | tee make_clean.log
$ make 2>&1 -j8 | tee make.log
$ make install 2>&1 | tee make_install.log
The (optional) statement -j8 (or -jn, n is the number of logical cores available) will speed up
compilation considerably.
The CYGWIN console executable you have been creating is an X11 application. This is a not
a Windows native environment. So you have to add an X11 graphics interface by installing the
XServer from the CYGWIN project. Before starting ngspice, you have to start the XServer by
the following commands within the CYGWIN window:
$ export DISPLAY=:0.0
$ xwin -multiwindow -clipboard &
If you don’t have libdl.a you may need to link libcygwin.a to libdl.a symbolically, for example:
$ cd /lib $ ln -s libcygwin.a libdl.a.

### 28.2.4 ngspice mingw or cygwin console executable w/o graphics

If you omit the configure flag –with-wingui or –with-x, you will obtain a console application
without graphics interface.

      ./configure --enable-cider --disable-debug
       CFLAGS=-m64 LDFLAGS=-m64 prefix=C:/Spice64

is an example for gcc, 64 Bit ngspice console. No graphics interface is provided. A warning
message will be issued upon starting ngspice. However, you may invoke Gnuplot or pyplot for
plotting (see 13.5.38).

### 28.2.5 ngspice for MS Windows, cross compiled from Linux

The ngspice main directory contains two scripts that provide cross compiling ngspice.exe or
ngspice.dll from a Linux setup. For details and prerequisites please have a look at cross-compile.sh
or cross-compile-shared.sh.

## 28.3 Ngspice Compilation under macOS

### 28.3.1 Compiling with Apple M2

Compiling on a MAC mini with Apple M2 chip and Sequoia 15.6.1 has been tested:
Install

    • xcode command line tools,

Install from Homebrew:

    • libtool. autoconf, automake, readline

    • ngspice (this provides a lot of dependencies, so it helps with the overall install)

    • gnuplot

    • bison 3.8.2

    • m4

    • XQuartz

    • ncurses

    • libsndfile

    • libsamplerate

Install from mac.r-project.org

    • openMP

Setting some paths in front of the path variable may be required (e.g. for bison, m4 ...). Two
new compile scripts are provided with ngspice:
compile_macos_clang_M2.sh and compile_macos_clang_M2_shared.sh.

### 28.3.2 Compiling on (old) Intel Hardware: Prerequisites

Basically compiling for macOS is similar to compiling for Linux. But one has to take the many
special features of the Apple world into account. The following is just a coarse description of
a setup and compiling, tested under Big Sur (macOS 11) on an Apple MacBook-Air with Intel
i5 chip. I reflects my (H. Vogt) setup for achieving a complete compile, including all relevant
ngspice options. This setup has grown over time. Please check, and if something is missing if
you do a fresh install and compile, please let me know.
Ngspice is written in C and thus a complete C/C++ compilation environment is needed. Ngspice
is developed with autotools, gcc, and GNU make. The graphics interface is using X11. Several
additional libraries have to be installed. As a first step install the Xquartz system, which enables
X11 support. Sevral additional tools and libraries need to by downloaded and installed, either
from Brew or MacPorts.
Required tools are autoconf, automake, libtool, bison.
Libraries are: readline, Xft2, Freetype, ncurses, fftw (optional), and several X11 extensions:
Xaw, Xmu, Xt, Xext, Xrender, SM, ICE.
The standard gcc provided by Apple Xcode (in fact a link to a clang/llvm compiler) does not
(yet?) support OpenMP, so you may use gcc-11 from Homebrew.

The following table lists the libraries required by ngspice. Libs located in /usr/local/opt/
and the compiler gcc-11 stem from Homebrew, the other libs are from macPorts.
List   of    standard
                   ngspice        dependencies    (acquired    with   command      otool -L
/usr/local/bin/ngspice ):

       /usr/local/opt/ncurses/lib/libncursesw.6.dylib
       /usr/local/opt/gcc/lib/gcc/11/libstdc++.6.dylib
       /usr/local/opt/fftw/lib/fftw3.3.dylib
       /usr/local/opt/readline/lib/libreadline.8.dylib
       /opt/local/lib/libXaw.7.dylib
       /opt/local/lib/libXmu.6.dylib
       /opt/local/lib/libXt.6.dylib
       /opt/local/lib/libXext.6.dylib
       /opt/local/lib/libX11.6.dylib
       /opt/local/lib/libfontconfig.1.dylib
       /opt/local/lib/libXrender.1.dylib
       /opt/local/lib/libfreetype.6.dylib
       /opt/local/lib/libSM.6.dylib
       /opt/local/lib/libICE.6.dylib
       /usr/local/opt/gcc/lib/gcc/11/libgomp.1.dylib
       /usr/lib/libSystem.B.dylib
       /usr/local/lib/gcc/11/libgcc_s.1.dylib

### 28.3.3 Compiling ngspice

A compile script is provided, supporting gcc-11 from Homebrew, see
https://sourceforge.net/p/ngspice/ngspice/ci/master/tree/compile_macos_gcc.sh.
ngspice is also available from MacPorts, Homebrew or Fink, partially as source code, partially
as an executable. ngspice from Homebrew for example currently does not offer the graphics
interface to X11 (thus not needing the above mentioned Quartz installation and X11 runtime
libraries).

### 28.3.4 Compiling ngspice shared library

The ngspice shared library does not have any command line or graphics interface, thus neither
needing X11 (Quartz) nor readline nor ncurses. Compilation (with gcc-11) is as straightforward
as running the compile script. The list of depencencies now is shorter than before:
List   of    shared     ngspice
                          dependencies            (acquired   with    command      otool -L
/usr/local/lib/libngspice.0.dylib ):

       /usr/local/opt/gcc/lib/gcc/11/libstdc++.6.dylib
       /usr/local/opt/fftw/lib/libfftw3.3.dylib
       /usr/local/opt/gcc/lib/gcc/11/libgomp.1.dylib
       /usr/lib/libSystem.B.dylib
       /usr/local/lib/gcc/11/libgcc_s.1.dylib

Currently no work has been done to create a package and have the package certified by Apple.

## 28.4 Reporting errors

Setting up ngspice is a complex task. The source code contains over 1500 files. ngspice should
run on various operating systems. Therefore errors may be found, some still evolving from the
original spice3f5 code, others introduced during the ongoing code enhancements.
If you happen to experience an error during compilation of ngspice, please send a report to the
development team. Ngspice is hosted on SourceForge, the preferred place to post a bug report is
the ngspice bug tracker. We would prefer to have your bug tested against the actual source code
available at Git, but of course a report using the most recent ngspice release is welcome! Please
provide the following information with your report: Ngspice version, Operating system, Small
input file to reproduce the bug (if to report a runtime error), Actual output versus the expected
output.
