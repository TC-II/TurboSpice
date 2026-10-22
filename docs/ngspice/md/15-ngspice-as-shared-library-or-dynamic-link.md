# 15 ngspice as shared library or dynamic link

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

library

ngspice may be compiled as a shared library. This allows adding ngspice to an application
that then gains control over the simulator. The shared module offers an interface that exports
functions controlling the simulator and callback functions for feedback.
So you may send an input ‘file’ with a netlist to ngspice, start the simulation in a separate thread,
read back simulation data at each time point, stop the simulator depending on some condition,
alter device or model parameters and then resume the simulation. Specific node values may be
controlled during simulation by EXTERNAL voltage or current sources (4.1.9). The simulator
calls back to the user program at each simulation step to request new values (15.3.3.11).
Shared ngspice does not have any user interface. The calling process is responsible for this. It
may offer a graphical user interface, add plotting capability or any other interactive element.
You may develop and optimize these user interface elements without a need to alter the ngspice
source code itself, using a console application or GUIs like gtk, Delphi, Qt or others.

## 15.1 Compile options

### 15.1.1 How to get the sources

Currently (as of ngspice-27 being the actual release), you will have to use the direct loading of
the sources from the git repository (see Chapt. 28.1.2).

### 15.1.2 Linux, MINGW, CYGWIN

Compilation is done as described in Chapts. 28.1 or 28.2.2. Use the configure option --with-ngshared
instead of --with-x or --with-wingui. In addition you might add (optionally) --enable-relpath
to avoid absolute paths when searching for code models. For MINGW you may edit compile_min.sh
accordingly and compile using this script in the MSYS2 window.
Other operation systems (Mac OS, BSD, ...) have not been tested so far. Your input is welcome!

### 15.1.3 MS Visual Studio

Compilation is similar to what has been described in Chapt. 28.2.1. However, there is a dedicated
project file coming with the source code to generate ngspice.dll. Go to the directory
visualc and start the project with double clicking on sharedspice.vcxproj.

## 15.2 Linking shared ngspice to a calling application

Basically there are two methods (as with all *.so, *.dll libraries). The caller may link to a (small)
library file during compiling/linking, and then immediately search for the shared library upon
being started. It is also possible to dynamically load the ngspice shared library at runtime using
the dlopen/LoadLibrary mechanisms.

### 15.2.1 Linking during creating the caller

While creating the ngspice shared lib, not only the *.so (*.dll) file is created, but also a small
library file, which just includes references to the exported symbols. Depending on the OS,
these may be called libngspice.dll.a, ngspice.lib. Linux and MINGW also allow linking to the
shared object itself. The shared object is not included into the executable component but is tied
to the execution.

### 15.2.2 Loading at runtime

dlopen (Linux) or LoadLibrary (MS Windows) will load libngspice.so or ngspice.dll into
the address space of the caller at runtime. The functions return a handle that may be used to
acquire the pointers to the functions exported by libngspice.so. Detaching ngspice at runtime
is equally possible (using dlclose/FreeLibrary), after the background thread has been stopped
and all callbacks have returned.

## 15.3 Shared ngspice API

The sources for the ngspice shared library API are contained in a single C file (sharedspice.c)
and a corresponding header file sharedspice.h. The type and function declarations are contained
in sharedspice.h, which may be directly added to the calling application, if written in
C or C++.

### 15.3.1 structs and types defined for transporting data

pvector_info is returned by the exported function ngGet_Vec_Info (see 15.3.2.8). Addresses of
the vector name, type, real or complex data are transferred and may be read asynchronously
during or after the simulation.

vector_info

      typedef struct vector_info {
          char *v_name;           /* Same as so_vname */
          int v_type;             /* Same as so_vtype */
                 _
          short v flags;          /* Flags (a combination of VF_*) */
          double *v_realdata;     /* Real data */
                   _    _
          ngcomplex t *v compdata;/* Complex data */
          int v_length;           /* Length of the vector */
      } vector_info, *pvector_info;

The next two structures are used by the callback function SendInitData (see 15.3.3.5). Each time
a new plot is generated during simulation, e.g. when a sequence of op, ac or tran is used, or
commands like linearize or fft are invoked, the function is called once by ngspice. Among
its parameters you find a pointer to a struct vecinfoall, which includes an array of vecinfo, one
for each vector. Pointers to the struct dvec, containing the vector, are included.
vecinfo

      typedef struct vecinfo
      {
         int number;       /* number of the vector, its position in the
                              linked list of vectors, starts with 0 */
         char *vecname;    /* name of the vector */
         bool is_real;     /* TRUE if the vector has real data */
         void *pdvec;      /* a void pointer to struct dvec *d,
                              containing the data array of the vector */
         void *pdvecscale; /* a void pointer to struct dvec *ds,
                              the scale vector */
      } vecinfo, *pvecinfo;

vecinfoall

      typedef struct vecinfoall
      {
          /* the plot */
          char *name;
          char *title;
          char *date;
          char *type;
          int veccount;

             /* the data as an array of vecinfo with
                length equal to the number of vectors
                in the plot */
             pvecinfo *vecs;

      } vecinfoall, *pvecinfoall;

The next two structures are used by the callback function SendData (see 15.3.3.4). Each time a
new data point (e.g. time value and simulation output value(s)) is added to the vector structure
of the current plot, the function SendData is called by ngspice, among its parameters the actual
pointer pvecvaluesall, which contains an array of pointers to pvecvalues, one for each vector.
Logic return values are of type NG_BOOL, which is typedefed to int.
vecvalues

      typedef struct vecvalues {
          char* name;      /* name of the vector */
          double creal;    /* data value added to the vector */
          double cimag;    /* data value added to the vector */
          NG_BOOL is_scale;   /* if ’name’ is the scale vector */
            _       _
          NG BOOL is complex; /* if the data are complex numbers */
      } vecvalues, *pvecvalues;

Pointer vecvaluesall to be found as parameter to callback function SendData.
vecvaluesall

      typedef struct vecvaluesall {
          int veccount;      /* number of vectors in plot */
          int vecindex;      /* current index for all vectors in
                                the plot, being equal to the
                                number of accepted data points */
          pvecvalues *vecsa; /* access to each vector in the plot,
                                indexed from 0 to veccount - 1 */
      } vecvaluesall, *pvecvaluesall;

When a new simulation (op, dc, ac, tran etc.) is started, a new ’plot’ structure (see 13.3) with
its vectors is set up. Several data structures, as described above, are set up as well, belonging
to this ’plot’: pvecinfo with vecinfo for each vector, vecinfoall, vecvaluesall, pvecvalues, and
vecvalues for each vector. Their pointers are kept constant during the current simulation, they
are created anew when another simulation is executed.

### 15.3.2 Exported functions

The functions listed in this chapter are the (only) symbols exported by the shared library.

#### 15.3.2.1 int ngSpice_Init(SendChar*, SendStat*, ControlledExit*, SendData*, SendInit-

            Data*, BGThreadRunning*, void*)

After caller has loaded ngspice.dll, the simulator has to be initialized by calling ngSpice_Init(...).
Address pointers of several callback functions (see 15.3.3), which are to be defined in the caller,
are sent to ngspice.dll. The int return value is not used.

Pointers to callback functions (details see 15.3.3):

SendChar* callback function for reading printf, fprintf, fputs (NULL allowed)

SendStat* callback function for reading status string and percent value (NULL allowed)

ControlledExit* callback function for transferring a flag to caller, generated by ngspice upon
     a call to function controlled_exit. May be used by caller to detach ngspice.dll, if dynam-
     ically loaded or to try any other recovery method, or to exit. (required)

SendData* callback function for sending an array of structs containing data values of all vec-
    tors in the current plot (simulation output) (NULL allowed)

SendInitData* callback function for sending an array of structs containing info on all vectors
     in the current plot (immediately before simulation starts) (NULL allowed)

BGThreadRunning* callback function for sending a boolean signal (true if thread is running)
    (NULL allowed)

void* Using the void pointer, you may send the object address of the calling function (’self’ or
     ’this’ pointer) to ngspice.dll. This pointer will be returned unmodified by any callback
     function (see the *void pointers in Chapt. 15.3.3). Callback functions are to be defined
     in the global section of the caller. Because they now have got the object address of the
     calling function, they may direct their actions to the calling object.

#### 15.3.2.2 int ngSpice_Init_Sync(GetVSRCData* , GetISRCData* , GetSyncData* , int*, void*)

Request additional callbacks to obtain values for externally controlled sources and for specialized
synchronisation and control of the transient analysis time-stepping loop.

Pointers to callback functions:

GetVSRCData* callback function for retrieving a voltage source value from caller (details at
    15.3.3.11, NULL allowed)

GetISRCData* callback function for retrieving a current source value from caller (details at
     15.3.3.12, NULL allowed)

GetSyncData* callback function for synchronization (details at 15.6.3.1, NULL allowed)

More pointers

int* pointer to integer unique to this shared library (defaults to 0)

void* pointer to user-defined data, will not be modified, but handed over back to caller dur-
     ing Callback, e.g. address of calling object. If NULL is sent here, userdata info from
     ngSpice_Init() will be kept, otherwise userdata will be overridden by new value from
     here.

#### 15.3.2.3 int ngSpice_Init_Evt(SendEvtData*, SendInitEvtData*, void*)

Request callbacks that report on event nodes.

Pointers to callback functions (details see 15.3.3.8):

SendEvtData* callback function to receive a report of the data for a specific event node at each
     time ’step’

SendInitEvtData* callback function to receive entries from the event node list during initiali-
     sation

void* pointer to user-defined data, will not be modified, but handed over back to caller during
     Callback, e.g. address of calling object.

#### 15.3.2.4 int ngSpice_Raw_Evt(const char* , SendRawEvtData* , void* )

Request callbacks that report all events for a specific event node. The callback function may
be called multiple times at each timestep, making the full event history available for specific
nodes.

Pointers to callback functions and other arguments (details see 15.3.3.10):

Node name of an event node

SendRawEvtData* callback funtion to receive a report of a single event on a specific event
    node at each time ’step’

void* pointer to user-defined data, will not be modified, but handed over back to caller during
     Callback, e.g. address of calling object.

#### 15.3.2.5 int ngSpice_Reset(void)

Reset the complete shared library: remove all data like using the ’quit’ command, then also
undo all initializations. Any allocated memory is freed. To restart ngspice, a new initialization
(15.3.2.1) is required.

#### 15.3.2.6 int ngSpice_Command(char*)

Send a valid command (see the control or interactive commands) from caller to ngspice.dll.
Will be executed immediately (as if in interactive mode). Some commands are rejected (e.g.
’plot’, because there is no graphics interface). Command ’quit’ will remove internal data, and
then send a notice to caller via ngexit(). The function returns a ’1’ upon error, otherwise ’0’.
Sending ngSpice_Command(NULL) will clear the internal control structures. Each command
sent to ngspice is stored in the control structures. If you run scripts with 10.000 or more commands,
sending NULL from time to time will release this memory.

#### 15.3.2.7 bool ngSpice_running (void)

Checks if ngspice is running in its background thread (returning ’true’).

#### 15.3.2.8 pvector_info ngGet_Vec_Info(char*)

uses the name of a vector (may be in the form ’vectorname’ or <plotname>.vectorname) as
parameter and returns a pointer to a vector_info struct. The caller may then directly assess the
vector data (but better should not modify them).

#### 15.3.2.9 int ngSpice_Circ(char**)

sends an array of null-terminated char* to ngspice.dll. Each char* contains a single line of a
circuit (Each line is like it is found in an input file *.sp.). The last entry to char** has to be
NULL. Upon receiving the array, ngspice.dll will immediately parse the input and set up the
circuit structure (as if the circuit is loaded from a file by the ’source’ command). The function
returns a ’1’ upon error, otherwise ’0’.

#### 15.3.2.10 char* ngSpice_CurPlot(void)

returns to the caller a pointer to the name of the current plot. For a definition of the term ’plot’
see Chapt. 13.3.

#### 15.3.2.11 char** ngSpice_AllPlots(void)

returns to the caller a pointer to an array of all plots (listed by their typename).

#### 15.3.2.12 char** ngSpice_AllVecs(char*)

returns to the caller a pointer to an array of all vector names in the plot named by the string in
the argument.

#### 15.3.2.13 bool ngSpice_SetBkpt(double)

see Chapt. 15.6.

#### 15.3.2.14 char *ngCM_Input_Path(char*)

Some XSPICE code models are supposed to read their input data (e.g. digital stimulus data)
from a file, like the Digital Source (8.4.21). There is a certain search sequence for the location
of this input file, e.g. the current directory or the directory of the previous input (e.g.
the netlist). However, when the netlist is entered into shared ngspice via the function int
ngSpice_Circ(char**) (15.3.2.9), there will be no information available about a previous input
directory. Therefore ngCM_Input_Path allows to send such directory information to the
XSPICE code models. Its return string is the newly set directory path, if sent with argument
NULL, it will return the currently available search path.

#### 15.3.2.15 int ngSpice_LockRealloc(void)

#### 15.3.2.16 int ngSpice_UnlockRealloc(void)

Locking and unlocking the realloc of output vectors during simulation. May be set before and
unset after reading output vectors in the primary thread, while the simulation in the background
thread is moving on.

#### 15.3.2.17 int ngSpice_nospinit(void)

Set variable no_spinit: do not search for or read initialization file spinit. The function has to
be called before calling ngSpice_Init() (15.3.2.1).

#### 15.3.2.18 int ngSpice_nospiceinit(void)

Set variable no_spiceinit: do not search for or read user initialization file .spiceinit. The
function has to be called before calling ngSpice_Init() (15.3.2.1).

#### 15.3.2.19 pevt_shared_data ngGet_Evt_NodeInfo(char*)

Get info about the event node vector. If node_name is NULL, just delete previous data

#### 15.3.2.20 char** ngSpice_AllEvtNodes(void)

get a list of all event nodes

### 15.3.3 Callback functions

Callback functions are a means to return data from ngspice to the caller. These functions are
defined as global functions in the caller, so to be reachable by the C-coded ngspice. They are
declared according to the typedefs given below. ngspice receives their addresses from the caller
upon initialization with the ngSpice_Init(...) function (see 15.3.2.1). If the caller will not make
use of a callback, it may send NULL instead of the address (except for ControlledExit, which
is always required).
If XSPICE is enabled, additional callback functions are made accessible by ngSpice_Init_Evt(...)
to obtain digital event node data.
If ngspice is run in the background thread (15.4.2), the callback functions (defined in the caller)
also are called from within that thread. One has to be carefully judging how this behavior might
influence the caller, where now you have the primary and the background thread running in
parallel. So make the callback function thread safe. The integer identification number is only
used if you run several shared libraries in parallel (see Chapt. 15.6). Three additional callback
function are described in Chapt. 15.6.3.

#### 15.3.3.1 typedef int (SendChar)(char*, int, void*)

char* string to be sent to caller output

int identification number of calling ngspice shared lib (default is 0, see Chapt. 15.6)

void* return pointer received from caller during initialization, e.g. pointer to object having sent
     the request

Sending output from stdout, stderr to caller. ngspice printf, fprintf, fputs, fputc functions are
redirected to this function. The char* string is generated by assembling the print outputs of
the above mentioned functions according to the following rules: The string commences with
‘stdout ’, if directed to stdout by ngspice (with ‘stderr ’ respectively); all tokens are assembled
in sequence, taking the printf format specifiers into account, until ‘\n’ is hit. If set
addescape is given in .spiceinit, the escape character \ is added to any character from $[]\"
found in the string.
Each callback function has a void pointer as the last parameter. This is useful in object oriented
programming. You may have sent the this (or self) pointer of the caller’s class object to
ngspice.dll during calling ngSpice_Init (15.3.2.1). The pointer is returned unmodified by each
callback, so the callback function may identify the class object that has initialized ngspice.dll.

#### 15.3.3.2 typedef int (SendStat)(char*, int, void*)

char* simulation status and value (in percent) to be sent to caller

int identification number of calling ngspice shared lib (default is 0, see Chapt. 15.6)

void* return pointer received from caller

sending simulation status to caller, e.g. the string tran 34.5%.

#### 15.3.3.3 typedef int (ControlledExit)(int, NG_BOOL, NG_BOOL, int, void*)

int exit status

NG_BOOL if true: immediate unloading dll, if false: just set flag, unload is done when func-
    tion has returned

NG_BOOL if true: exit upon ’quit’, if false: exit due to ngspice.dll error

int identification number of calling ngspice shared lib (default is 0, see Chapt. 15.6)

void* return pointer received from caller

asking for a reaction after controlled exit.

#### 15.3.3.4 typedef int (SendData)(pvecvaluesall, int, int, void*)

vecvaluesall* pointer to array of structs containing actual values from all vectors

int number of structs (one per vector)

int identification number of calling ngspice shared lib (default is 0, see Chapt. 15.6)

void* return pointer received from caller

send back actual vector data.

#### 15.3.3.5 typedef int (SendInitData)(pvecinfoall, int, void*)

vecinfoall* pointer to array of structs containing data from all vectors right after initialization

int identification number of calling ngspice shared lib (default is 0, see Chapt. 15.6)

void* return pointer received from caller

send back initialization vector data.

#### 15.3.3.6 typedef int (BGThreadRunning)(NG_BOOL, int, void*)

NG_BOOL false if background thread is running, otherwise true

int identification number of calling ngspice shared lib (default is 0, see Chapt. 15.6)

void* return pointer received from caller

indicate if background thread is running

#### 15.3.3.7 typedef int ngSpice_Decode_Evt)(void*, int, double *, const **)

void* pointer to event data, typically received from an event callback (see 15.3.3.10)

int identifies data type, 0 for digital node values

double* pointer to receive the “plot value” for the data, usually zero or one for a digital node

char** pointer to a char* variable the will receive a pointer to a read-only string description of
     the input value

Decodes an event value for display.

Callback functions addresses received from caller with ngSpice_Init_Evt() function:

#### 15.3.3.8 typedef int (SendEvtData)(int, double, double, char *, void *, int, int, int, void*)

int node index

double actual simulation time

double a real value for specified structure component for plotting purposes

char* a string value for specified structure component for printing

void* a binary data structure

int size of the binary data structure

int the mode (op, dc, tran) we are in

int identification number of calling ngspice shared lib

void* return pointer received from caller

Upon a time step finished, called per node.

#### 15.3.3.9 typedef int (SendInitEvtData)(int, int, char*, char*, int, void*)

int node index

int maximum node index, number of nodes

char* node name

char* udn-name, node type

int identification number of calling ngspice shared lib

void* return pointer received from caller

Upon initialization, called once per event node to build up a dictionary of nodes.

#### 15.3.3.10 typedef int (SendRawEvtData)(double, void*, void*, int)

double event time

void* pointer to the new node value, usually a struct Digital_t. See ngSpice_Decode_Evt()
     (15.3.3.7).

void* return pointer received from caller

int zero if another call for the same node will follow, 1 on the final call for this node and
      timestep

Called for each event at each time step as requested by ngSpice_Raw_Evt() (15.3.2.4).

#### 15.3.3.11 typedef int (GetVSRCData)(double*, double, char*, int, void*)

double* return voltage value
double actual time
char* node name
int identification number of calling ngspice shared lib
void* return pointer received from caller

Ask for a VSRC EXTERNAL voltage value. The independent voltage source (see Chapt. 4.1)
with EXTERNAL option (4.1.9) sets a voltage value to the node defined in the netlist and named
here at the time returned by the simulator.

#### 15.3.3.12 typedef int (GetISRCData)(double*, double, char*, int, void*)

double* return current value
double actual time
char* node name
int identification number of calling ngspice shared lib
void* return pointer received from caller

Ask for ISRC EXTERNAL value. The independent current source (see 4.1) with EXTERNAL
option (4.1.9) allows setting a current value to the node defined by the netlist and named here
at the time returned by the simulator.

## 15.4 General remarks on using the API

### 15.4.1 Loading a netlist

Basically the input to shared ngspice is the same as if you would start a ngspice batch job, e.g.
you enter a netlist and the simulation command (any .dot analysis command like .tran, .op,
or .dc etc. as found in Chapt. 11.3), as well as suitable options.
Typically you should not include a .control section in your input file. Any script described
in a .control section for standard ngspice should better be emulated by the caller and be sent
directly to ngspice.dll. Start the simulation according to Chapt. 15.4.2 in an extra thread.
As an alternative, only the netlist has to be entered (without analysis command), then you may
use any interactive command as listed in Chapt. 13.5 (except for the plot command).
However, for users without direct access to source code commands (e.g. KiCad users), it might
be advantageous to add a .control section to their netlist simulation dot commands. please be
careful and check for chapter 15.4.1.4.
The ‘typical usage’ examples given below are part of a caller written in C.

#### 15.4.1.1 Loading from file

As with interactive ngspice, you may use the ngspice internal command source (13.5.87) to
load a complete netlist from a file.
Typical usage:

      ngSpice_Command("source ../examples/adder_mos.cir");

#### 15.4.1.2 Loading line by line

As with interactive ngspice, you may use the ngspice internal command circbyline (13.5.14) to
send a netlist line by line to the ngspice circuit parser.
Typical usage:

      ngSpice_Command("circbyline fail test");
      ngSpice_Command("circbyline V1 1 0 1");
      ngSpice_Command("circbyline R1 1 0 1");
      ngSpice_Command("circbyline .dc V1 0 1 0.1");
      ngSpice_Command("circbyline .end");

The first line is a title line, which will be ignored during circuit parsing. As soon as the line
.end has been sent to ngspice, circuit parsing commences.

#### 15.4.1.3 Loading as a string array

Typical usage:

      circarray = (char**)malloc(sizeof(char*) * 7);
      circarray[0] = strdup("test array");
      circarray[1] = strdup("V1 1 0 1");
      circarray[2] = strdup("R1 1 2 1");
      circarray[3] = strdup("C1 2 0 1 ic=0");
      circarray[4] = strdup(".tran 10u 3 uic");
      circarray[5] = strdup(".end");
      circarray[6] = NULL;
      ngSpice_Circ(circarray);

An array of char pointers is malloc’d, each netlist line is then copied to the array. strdup will
care for the memory allocation. The first entry to the array is a title line, the last entry has to
contain NULL. ngSpice_Circ(circarray); sends the array to ngspice, where circuit parsing is
started immediately. Don’t forget to free the array after sending it, to avoid a memory leak.
For the latter two options to load a netlist, there is some caveat though. When sending the
netlist from caller to shared ngspice, ngspice will not get any automatic notion of a potential
input directory, as is possible and used with standard ngspice. You will either have to set the
environmental variable NGSPICE_INPUT_DIR to the input file path, especially when in the

netlist other .include ./nextinput.inc commands with relative paths are used or you are
using XSPICE code models that require loading an input file. Or you may set the variable
sourcepath (13.7) in .spiceinit. The command
set sourcepath = ( D:/mypath/input $sourcepath )
will add D:/mypath/input to the front of the path list, only this leading path entry is sent to
the code models.

#### 15.4.1.4 Using a .control section

If the simulation is started with the background thread (command bg_run), the .control section
commands are executed immediately after bg_run has been given, i.e. typically before the simulation
has finished. This often is not very useful because you want to evaluate the simulation
results. If the predefined variable controlswait is set in .spiceinit or spice.rc, the command
execution is delayed until the background thread has returned (aka the simulation has finished).
If set controlswait is given inside of the .control section, only the commands following this
statement are delayed.

### 15.4.2 Running the simulation

The following commands are used to start the simulator in its own thread, halt the simulation
and resume it again. The extra (background) thread enables the caller to continue with other
tasks in the main thread, e.g. watching its own event loop. Of course you have to take care
that the caller will not exit before ngspice is finished, otherwise you immediately will lose all
data. After having halted the simulator by suspending the background thread, you may assess
data, change ngspice parameters, or read output data using the caller’s main thread, before you
resume simulation using a background thread again. While the background thread is running,
ngspice will reject any other command sent by ngSpice_Command.

Typical usage:

      ngSpice_Command("bg_run");
      ...
      ngSpice_Command("bg_halt");
      ...
      ngSpice_Command("bg_resume");

Basically you may send the commands ’run’ or ’resume’ (no prefix bg_), starting ngspice within
the main thread. The caller then has to wait until ngspice returns from simulation. A command
’halt’ is not available then.

After simulation is finished (test with callback 15.3.3.6), you may send other commands from
Chapt. 13.5, emulating any .control script. These commands are executed in the main thread,
which should be okay because execution time is typically short.

### 15.4.3 Accessing data

#### 15.4.3.1 Synchronous access

The callback functions SendInitData (15.3.3.5) and SendData (15.3.3.4) allow access to simulator
output data synchronized with the simulation progress.
Each time a new plot is generated during simulation, e.g. when a sequence of op, ac and tran is
used or commands like linearize or fft are invoked, the callback SendInitData is called by
ngspice. Immediately after setting up the vector structure of the new plot, the function is called
once. Its parameter is a pointer to the structure vecinfoall (15.3.1), which contains an array of
structures vecinfo, one for each vector in the actual plot. You may simply use vecname to get
the name of any vector. This time the vectors are still empty, but pointers to the vector structure
are available.
Each time a new data point (e.g. time value and simulation output value(s)) is added to the
vector structure of the current plot, the function SendData is called by ngspice. This allows
you to immediately access the simulation output synchronized with the simulation time, e.g.
to interface it to a runtime plot or to use it for some controlled simulation by stopping the
simulation based on a condition, altering parameters and resume the simulation. SendData
returns a structure vecvaluesall as parameter, which contains an array of structures vecvalues,
one for each vector.
Some code to demonstrate the callback function usage is referenced below (15.5).

#### 15.4.3.2 Asynchronous access

During simulation, while the background thread is running, or after it is finished, you may use
the functions ngSpice_CurPlot (15.3.2.10), ngSpice_AllPlots (15.3.2.11), ngSpice_AllVecs
(15.3.2.12) to retrieve information about vectors available, and function ngGet_Vec_Info (15.3.2.8)
to obtain data from a vector and its corresponding scale vector. The timing of the caller and the
simulation progress are independent from each other and not synchronized.
Again some code to demonstrate the callback function usage is referenced below (15.5).

#### 15.4.3.3 XSPICE event node data

After starting the simulation, in a first step the callback function SendInitEvtData is called once
for each event node. All nodes are numbered in ascending order. The first function argument
is the actual node number, the second sets the total amount of nodes, then node name and node
type follow. You may set up an array to store name and type, indexed by the node number.
During simulation, after each time step ngspice checks if a node has changed. If so, SendEvt-
Data is called for each node that changed, returning the simulation time, the node number, and
the node value as a char* string, consisting of one out of 0s, 1s, Us, 0r, 1r, Ur, 0z, 1z, Uz, 0u,
1u, Uu (see 8.6.1). The double real value and the void* binary data structure arguments are for
future enhancements of the data interface. The int mode returns 0 for op, 1 for dc, 2 for ac ,
and 3 for tran simulation. The final int is useful to identify the ngspice lib by number if you run
several in parallel (see 15.6). The final *void just returns the pointer received from caller. e.g.
to identify the calling object. To receive all event data for a node, rather than the final value at
the end of a time step, use ngSpice_Raw_Evt() (15.3.2.4).

### 15.4.4 Altering model or device parameters

After halting ngspice by stopping the background thread (15.4.2), nearly all ngspice commands
are available. Especially alter (13.5.3) and altermod (13.5.4) may be used to change device
or model parameters. After the modification, the simulation may be resumed immediately.
Changes to a circuit netlist, however, are not possible. You would need to load a complete new
netlist (15.4.1) and restart the simulation from the beginning.

### 15.4.5 Output

After the simulation is finished, use the ngspice commands write (13.5.108) or wrdata (13.5.107)
to output data to a file as usual, use the print command (13.5.58) to retrieve data via callback
SendChar (15.3.3.1), or refer to accessing the data as described in Chapt. 15.4.3.
Typical usage:

      ngSpice_Command("write testout.raw V(2)");
      ngSpice_Command("print V(2)");

### 15.4.6 Error handling

There are several occasions where standard ngspice suffers from an error, cannot recover internally
and then exits. If this is happening to the shared module this would mean that the
parent application, the caller, is also forced to exit. Therefore (if not suffering from a segfault)
ngspice.dll will call the function controlled_exit as usual, this now calls the callback function
’ControlledExit’ (15.3.3.3), which hands over the request for exiting to the caller. The
caller now has the task to handle the exit code for ngspice.
If ngspice has been linked at runtime by dlopen/LoadLibrary (see 15.2.2), the callback may
close all threads, and then detach ngspice.dll by invoking dlclose/FreeLibrary. The caller
may then restart ngspice by another loading and initialization (15.3.2.1).
If ngspice is included during linking the caller (see 15.2.1), there is not yet a good and general
solution to error handling, if the error is non-recoverable from inside ngspice.

## 15.5 Example applications

Four executables (coming with source code) serve as examples for controlling ngspice. These
are not meant to be ‘production’ programs, but just give some commented example usages of
the interface.
ng_start.exe is a MS Windows application loading ngspice.dll dynamically. All functions
and callbacks of the interface are assessed. The source code, generated with Turbo Delphi
2006, may be found here, the binaries compiled for 32 Bit are here.
Two console applications, compilable with Linux, CYGWIN, MINGW or MS Visual Studio,
are available here, demonstrating either linking upon start-up or loading shared ngspice dynamically
at runtime. A simple feedback loop is shown in tests 3 and 4, where a device parameter
is changed upon having an output vector value crossing a limit.

A fourth program is included with the Ngspice source code at examples/shared. The”xsh”
program provides a command-line interface to an instance of the shared library. Interactive
interpreter commands can be given to load and simulate a circuit. Local commands, starting
with “/”, exercise most of the API functions and the contents of callbacks are displayed.
An XSPICE event node example may be assessed at ngspice/visualc/ng_shared_xspice_v, currently
tested only with MS Windows and compiled with Visual Studio.

## 15.6 ngspice parallel

The following chapter describes an offer to the advanced user and developer community. If you
are interested in evaluating the parallel and synchronized operation of several ngspice instances,
this may be one way to go. However, no ready to use implementation is available. You will
find a toolbox and some hints how to use it. Parallelization and synchronization is your task by
developing a suitable caller! And of course another major input has to come from partitioning
the circuit into suitable, loosely coupled pieces, each with its own netlist, one netlist per ngspice
instance. And you have to define the coupling between the circuit blocks. Both are not provided
by ngspice, but are again your responsibility. Both are under active research, and the toolbox
described below is an offer to join that research.

### 15.6.1 Go parallel!

A simple way to run several invocations of ngspice in parallel for transient simulation is to define
a caller that loads two or more ngspice shared libraries. There is one prerequisite however
to do so: the shared libraries have to have different names. So compile ngspice shared lib
(see 15.1), then copy and rename the library file, e.g. ngspice.dll may become ngspice1.dll,
ngspice2.dll etc. Then dynamically load ngspice1.dll, retrieve its address, initialize it by
calling ngSpice_init() (see 15.3.2.1), then continue initialization by calling ngSpice_init_Sync()
(see 15.6.2.1). An integer identification number may be sent during this step to later uniquely
identify each invocation of the shared library, e.g. by having any callback use this identifier.
Repeat the sequence with ngspice2.dll and so on.
Inter-process communication and synchronization is now done by using three callback functions.
To understand their interdependence, it might be useful to have a look at the transient
simulation sequence as defined in the ngspice source file dctran.c. The following listing includes
the shared library option (It differs somewhat from standard procedure) and disregards
XSPICE.

   1. initialization

   2. calculation of operating point

   3. next time step: set new breakpoints (VSRC, ISRC, TRA, LTRA)

   4. send simulation data to output, callback function SendData* datfcn

   5. check for autostop and other end conditions

   6. check for interrupting simulation (e.g. by bg_halt)

   7. breakpoint handling (e.g. enforce breakpoint, set new small cktdelta if directly after the
      breakpoint)

   8. calling ngspice internal function sharedsync() that invokes callback function GetSync-
      Data* getsync with location flag loc = 0

   9. save the previous states

 10. start endless loop

 11. save cktdelta to olddelta, set new time point by adding cktdelta to ckttime

 12. new iteration of circuit at new time point, which uses callback functions GetVSRCData*
     getvdat and GetISRCData* getidat to retrieve external voltage or current inputs, returns
     redostep=0, if converged, redostep=1 if not converged

 13. if not converged, divide cktdelta by 8

 14. check for truncation error with all non-linear devices, if necessary create a new (smaller)
     cktdelta to limit the error, optionally change integration order

 15. calling ngspice internal function sharedsync() that invokes callback function GetSync-
     Data* getsync with location flag loc = 1: as a result either goto 3 (next time step) or to
     10 (loop start), depending on ngspice and user data, see the next paragraph.

The code of the synchronization procedure is handled in the ngspice internal function sharedsync()
and its companion user defined callback function GetSyncData* getsync. The actual setup is
as follows:
If no synchronization is asked for (GetSyncData* set to NULL), program control jumps to ’next
time step’ (3) if redostep==0, or subtracts olddelta from ckttime and jumps to ’loop start’ (9) if
redostep <> 0. This is the standard ngspice behavior.
If GetSyncData* has been set to a valid address by ngSpice_Init_Sync(), the callback function
getsync is involved. If redostep <> 0, olddelta is subtracted from ckttime, getsync is called,
either the cktdelta time suggested by ngspice is kept or the user provides his own deltatime,
and the program execution jumps to (9) for redoing the last step with the new deltatime. The
return value of getsync is not used. If redostep == 0, getsync is called. The user may keep
the deltatime suggested by ngspice or define a new value. If the user sets the return value of
getsync to 0, the program execution then jumps to ’next time step’ (3). If the return value of
getsync is 1, olddelta is subtracted from ckttime, and the program execution jumps to (9) for
redoing the last step with the new deltatime. Typically the user provided deltatime should be
smaller than the value suggested by ngspice.

### 15.6.2 Additional exported functions

The following functions (exported or callback) are designed to support the parallel action of
several ngspice invocations. They may be useful, however, also when only a single library is
loaded into a caller, if you want to ’play’ with advancing simulation time.

#### 15.6.2.1 Requesting the synchronisation callback

A callback that allows the control program to take control of the transient simulation loop may
be requested by setting the GetSyncData argument of ngSpice_Init_Sync(). See 15.3.2.2

#### 15.6.2.2 NG_BOOL ngSpice_SetBkpt(double)

Sets a breakpoint in ngspice, a time point that the simulator is enforced to hit during the transient
simulation. After the breakpoint time has been hit, the next delta time starts with a small value
and is ramped up again. A breakpoint should be set only when the background thread in ngspice
is not running (before the simulation has started, or after the simulation has been paused by
bg_halt). The time sent to ngspice should be larger than the current time (which is either 0
before start or given by the callback GetSyncData (15.6.3.1). Several breakpoints may be set.

### 15.6.3 Additional callback functions

#### 15.6.3.1 typedef int (GetSyncData)(double, double*, double, int, int, int void*)

double actual time (ckt->CKTtime)

double* delta time (ckt->CKTdelta)

double old delta time (olddelta)

int redostep flag, non zero if the previous time step failed

int identification number of calling ngspice shared lib

int location of call for synchronization in dctran.c

void* return pointer received from caller

Ask for new delta time depending on synchronization requirements. See 15.6.1 for an explanation.

### 15.6.4 Parallel ngspice example

A first example is available as a compacted 7z archive. It contains the source code of a controlling
application, as well as its compiled executable and ngspice.dll (for MS Windows). As the
input circuit an inverter chain has been divided into three parts. Three ngspice shared libraries
are loaded, each simulates one partition of the circuit. Interconnections between the partitions
are provided via a callback function. The simulation time is synchronized among the three
ngspice invocations by another callback function.
