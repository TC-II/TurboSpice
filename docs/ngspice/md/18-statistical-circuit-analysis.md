# 18 Statistical circuit analysis

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

## 18.1 Introduction

Real circuits do not operate in a world with fixed values of device parameters, power supplies
and environmental data. Even if a ngspice output offers 5 digits or more of precision, this
should not mislead you thinking that your circuits will behave exactly the same. All physical
parameters influencing a circuit (e.g. MOS Source/drain resistance, threshold voltage, transconductance)
are distributed parameters, often following a Gaussian distribution with a mean value
µand a standard deviation σ .
To obtain circuits operating reliably under varying parameters, it might be necessary to simulate
them taking certain parameter spreads into account. ngspice offers several methods supporting
this task. A powerful random number generator is working in the background. It is not providing
true random numbers, but a long sequence of pseudo random numbers. This sequence
depends on a seed value. The same seed value will deliver the same sequence of random numbers.
ngspice offers several methods to set this seed value. If no input is given, then ngspice sets the
seed (stored in variable rndseed) to 1 upon start up. With the option SEED you may either set
a value to rndseed upon start up of ngspice (option SEED=nn, nn is an integer greater than 0),
or obtain a “random” number as seed, that is the number of seconds since 01.01.1970 (option
SEED=random). This command is best set in .spiceinit (12.6). With the command setseed (see
chapt.13.5.77) you may choose any other seed value (integer greater than 0).
The following three chapters offer a short introduction to the statistical methods available in
ngspice. The diversity of approaches stems from historical reasons, and from some efforts to
make ngspice compatible to other simulators.

## 18.2 Using random param(eters)

The ngspice frontend (with its ’numparam’ parser) contains the .param (see Chapt. 2.11.1) and
.func (see Chapt. 2.12) commands. Among the built-in functions supported (see 2.11.5) you
will find the following statistical functions:

     Built-in function                                    Notes
  gauss(nom, rvar, sigma)         nominal value plus variation drawn from Gaussian
                                 distribution with mean 0 and standard deviation rvar
                                        (relative to nominal), divided by sigma
 agauss(nom, avar, sigma)         nominal value plus variation drawn from Gaussian
                                distribution with mean 0 and standard deviation avar
                                              (absolute), divided by sigma
      unif(nom, rvar)             nominal value plus relative variation (to nominal)
                                         uniformly distributed between +/-rvar
      aunif(nom, avar)        nominal value plus absolute variation uniformly distributed
                                                     between +/-avar
      limit(nom, avar)         nominal value +/-avar, depending on random number in
                                                [-1, 1] being > 0 or < 0
The frontend parser evaluates all .param or .func statements upon start-up of ngspice, before
the circuit is evaluated. The parameters aga, aga2, lim obtain their numerical values once. If the
random function appears in a device card (e.g. v11 11 0 ’agauss(1,2,3)’), a new random
number is generated.
Random number example using parameters:

      * random number tests
      .param aga = agauss(1,2,3)
      .param aga2=’2*aga’
      .param lim=limit(0,1.2)
      .func rgauss(a,b,c) ’5*agauss(a,b,c)’
      * always same value as defined above
      v1 1 0 ’lim’
      v2 2 0 ’lim’
      * may be a different value
      v3 3 0 ’limit(0,1.2)’
      * always new random values
      v11 11 0 ’agauss(1,2,3)’
      v12 12 0 ’agauss(1,2,3)’
      v13 13 0 ’agauss(1,2,3)’
      * same value as defined above
      v14 14 0 ’aga’
      v15 15 0 ’aga’
      v16 16 0 ’aga2’
      * using .func, new random values
      v17 17 0 ’rgauss(0,2,3)’
      v18 18 0 ’rgauss(0,2,3)’
      .op
      .control
      run
      print v(1) v(2) v(3) v(11) v(12) v(13)
      print v(14) v(15) v(16) v(17) v(18)
      .endc
      .end

So v1, v2, and v3 will get the same value, whereas v4 might differ. v11, v12, and v13 will get
different values, v14, v15, and v16 will obtain the values set above in the .param statements.
.func will start its replacement algorithm, rgauss(a,b,c) will be replaced everywhere by
5*agauss(a,b,c).

Thus device and model parameters may obtain statistically distributed starting values. You
simply set a model parameter not to a fixed numerical value, but insert a ’parameter’ instead,
which may consist of a token defined in a .param card, by calling .func or by using a builtin
function, including the statistical functions described above. The parameter values will be
evaluated once immediately after reading the input file.

## 18.3 Behavioral sources (B, E, G, R, L, C) with random con-

          trol

All sources listed in the section header may contain parameters, which will be evaluated before
simulation starts, as described in the previous section (18.2). In addition the nonlinear voltage or
current sources (B-source, Chapt. 5) as well as their derivatives E and G, but also the behavioral
R, L, and C may be controlled during simulation by a random independent voltage source V
with TRRANDOM option (Chapt. 4.1.8).

An example circuit, a Wien bridge oscillator from input file /examples/Monte_Carlo/OpWien.sp
is distributed with ngspice or available at Git. The two frequency determining pairs of R and
C are varied statistically using four independent Gaussian voltage sources as the controlling
units. An excerpt of this command sequence is shown below. The total simulation time ttime
is divided into 100 equally spaced blocks. Each block will get a new set of control voltages,
e.g. VR2, which is Gaussian distributed, mean 0 and absolute deviation 1. The resistor value
is calculated with ±10% spread, the factor 0.033 will set this 10% to be a deviation of 1 sigma
from nominal value.

Examples for control of a behavioral resistor:

      * random resistor
      .param res = 10k
      .param ttime=12000m
      .param varia=100
      .param ttime10 = ’ttime/varia’
      * random control voltage (Gaussian distribution)
      VR2 r2 0 dc 0 trrandom (2 ’ttime10’ 0 1)
      * behavioral resistor
      R2 4 6 R = ’res + 0.033 * res*V(r2)’

So within a single simulation run you will obtain 100 different frequency values issued by the
Wien bridge oscillator. The voltage sequence VR2 is shown below.

## 18.4 ngspice control language

The ngspice control language is described in detail in Chapt. 13.8. Simple or complex scripts
may be generated. All commands listed in Chapt. 13.5 are available, as well as the builtin
functions described in Chapt. 13.2, the control structures listed in Chapt. 13.6, and the
predefined variables from Chapt. 13.7. Variables and functions are typically evaluated after
a simulation run. You may created loops with several simulation runs and change device and
model parameters with the alter (13.5.3) or altermod (13.5.4) commands, as shown in the next
section 18.5. You may even interrupt a simulation run by proper usage of the stop (13.5.92) and
resume (13.5.67) commands. After stop you may change device or model parameters and then
go on with resume, continuing the simulation with the new parameter values.

The statistical functions provided for scripting are listed in the following table:

       Name                                         Function
     rnd(vector)        A vector with each component a random integer between 0
                         and the absolute value of the input vector’s corresponding
                                            integer element value.
    sgauss(vector)           Returns a vector of random numbers drawn from a
                           Gaussian distribution (real value, mean = 0 , standard
                             deviation = 1). The length of the vector returned is
                         determined by the input vector. The contents of the input
                          vector will not be used. A call to sgauss(0) will return a
                         single value of a random number as a vector of length 1..
    sunif(vector)            Returns a vector of random real numbers uniformly
                        distributed in the interval [-1 .. 1]. The length of the vector
                        returned is determined by the input vector. The contents of
                          the input vector will not be used. A call to sunif(0) will
                          return a single value of a random number as a vector of
                                                    length 1.
   poisson(vector)        Returns a vector with its elements being integers drawn
                           from a Poisson distribution. The elements of the input
                             vector (real numbers) are the expected numbers λ .
                          Complex vectors are allowed, real and imaginary values
                                             are treated separately.
 exponential(vector)      Returns a vector with its elements (real numbers) drawn
                        from an exponential distribution. The elements of the input
                            vector are the respective mean values (real numbers).
                          Complex vectors are allowed, real and imaginary values
                                             are treated separately.

## 18.5 Monte-Carlo Simulation

Statistically varying device or model parameters are the basis for Monte-Carlo simulation. The
statistical functions described in chapter 18.2 may be used on the device instance line or in a
device model (see chapter 18.5.1).

An alternative is using the ngspice control language to run Monte-Carlo simulations (see 18.5.2).
Calls to the functions sgauss(0) or sunif(0) (see 13.2) will return Gaussian or uniform distributed
random numbers (real numbers), stored in a vector. You may define (see 13.5.19) your own
function using sgauss or sunif, e.g. to change the mean or range. In a loop (see 13.6) then you
may call the alter (13.5.3) or altermod (13.5.4) statements with random parameters followed by
an analysis like op, dc, ac, tran or other.

### 18.5.1 Varying model or instance parameters

Monte-Carlo example, instance and model

      * monte carlo
      V1 1 0 1
      R1 1 0 rmod
      .model rmod res (r={gauss(2, 0.03, 1)} TC1=3.3e-3)
      R2 1 0 rmod
      R3 1 0 R = {gauss(2, 0.03, 1)}
      R4 1 0 R = {gauss(2, 0.03, 1)}
      .save @R1[i] @R2[i] @R3[i] @R4[i]

In the example shown above all resistance values (nominally 2 Ohms) will be determined during
parsing the netlist. R1 and R2 will always get the same resistance, as they both are using the
same model rmod. R3 and R4 are set individually according to the gauss function (see chapter
18.2). Thus a typical result of an operating point simulation may look like:

Operating point result of the example given above

      * monte carlo result (current through R)
      @r1[i] = 5.044575e-01
      @r2[i] = 5.044575e-01
      @r3[i] = 5.418674e-01
      @r4[i] = 4.942051e-01

Several ngspice runs are required to obtain a statistical distribution of the circuit performance.

### 18.5.2 Using the ngspice control language

#### 18.5.2.1 Example 1

The first examples is a LC band pass filter, where L and C device parameters will be changed 100
times. Each change is followed by an ac analysis. All graphs of output voltage versus frequency
are plotted. The file is available in the distribution as /examples/Monte_Carlo/MonteCarlo.sp
as well as from the git repository .

Monte-Carlo example 1

     Perform Monte Carlo simulation in ngspice
     V1 N001 0 AC 1 DC 0
     R1 N002 N001 141
     *
     C1 OUT 0 1e-09
     L1 OUT 0 10e-06
     C2 N002 0 1e-09
     L2 N002 0 10e-06
     L3 N003 N002 40e-06
     C3 OUT N003 250e-12
     *
     R2 0 OUT 141
     *
     .control
       let mc_runs = 100
       let run = 1
       set curplot = new        $ create a new plot
       set scratch = $curplot   $ store its name to ’scratch’
     *
         define unif(nom, var) (nom + nom*var * sunif(0))
         define aunif(nom, avar) (nom + avar * sunif(0))
         define gauss(nom, var, sig) (nom + nom*var/sig * sgauss(0))
         define agauss(nom, avar, sig) (nom + avar/sig * sgauss(0))
     *
       dowhile run <= mc_runs
     *   alter c1 = unif(1e-09, 0.1)
     *   alter l1 = aunif(10e-06, 2e-06)
     *   alter c2 = aunif(1e-09, 100e-12)
     *   alter l2 = unif(10e-06, 0.2)
     *   alter l3 = aunif(40e-06, 8e-06)
     *   alter c3 = unif(250e-12, 0.15)
         alter c1 = gauss(1e-09, 0.1, 3)
         alter l1 = agauss(10e-06, 2e-06, 3)
         alter c2 = agauss(1e-09, 100e-12, 3)
         alter l2 = gauss(10e-06, 0.2, 3)
         alter l3 = agauss(40e-06, 8e-06, 3)
         alter c3 = gauss(250e-12, 0.15, 3)
         ac oct 100 250K 10Meg
         set run ="$&run"     $ create a variable from the vector
         set dt = $curplot    $ store the current plot to dt
         setplot $scratch     $ make ’scratch’ the active plot
     * store the output vector to plot ’scratch’
         let vout{$run}={$dt}.v(out)
         setplot $dt          $ go back to the previous plot
         let run = run + 1
       end
       plot db({$scratch}.all)
     .endc

     .end

#### 18.5.2.2 Example 2

A more sophisticated input file for Monte Carlo simulation is distributed with the file /examples/Monte_Carlo/MC_ring.sp
(or git repository). Due to its length it is not reproduced here,
but some comments on its enhancements over example 1 (18.5.2.1) are presented in the following.
A 25-stage ring oscillator is the circuit used with a transient simulation. It comprises of CMOS
inverters, modeled with BSIM3. Several model parameters (vth, u0, tox, L, and W) shall be
varied statistically between each simulation run. The frequency of oscillation will be measured
by a fft and stored. Finally a histogram of all measured frequencies will be plotted.
The function calls to sunif(0) and sgauss(0) return uniformly or Gaussian distributed random
numbers. A function unif, defined by the line
define unif(nom, var) (nom + (nom*var) * sunif(0))
will return a value with mean nom and deviation var relative to nom.
The line
set n1vth0=@n1[vth0]
will store the threshold voltage vth0, given by the model parameter set, into a variable n1vth0,
ready to be used by unif, aunif, gauss, or agauss function calls.
In the simulation loop the altermod command changes the model parameters before a call to
tran. After the transient simulation the resulting vector is linearized, a fft is calculated, and the
maximum of the fft signal is measured by the meas command and stored in a vector maxffts.
Finally the contents of the vector maxffts is plotted in a histogram.
For more details, please have a look at the strongly commented input file MC_ring.sp.

#### 18.5.2.3 Example 3

The next example is contained in the files MC_2_control.sp and MC_2_circ.sp from folder
/examples/Monte_Carlo/. MC_2_control.sp is a ngspice script (see 13.8). It starts a loop
by setting the random number generator seed value to the value of the loop counter, sources
the circuit file MC_2_circ.sp, runs the simulation, stores a raw file, makes an fft, saves the
oscillator frequency thus measured, deletes all outputs, increases the loop counter and restarts
the loop. The netlist file MC_2_circ.sp contains the circuit, which is the same ring oscillator
as of example 2. However, now the MOS model parameter set, which is included with this
netlist file, inherits some AGAUSS functions (see 2.11.5) to vary threshold voltage, mobility
and gate oxide thickness of the NMOS and PMOS transistors. This is an approach similar to
what commercial foundries deliver within their device libraries. So this example may be your
source for running Monte Carlo with commercial libs. Start example 3 by calling
ngspice -o MC_2_control.log MC_2_control.sp

## 18.6 Data evaluation with Gnuplot

Run the example file /examples/Monte_Carlo/OpWien.sp, described in Chapt. 18.3. Generate
a plot with Gnuplot by the ngspice command

gnuplot pl4mag v4mag xlimit 500 1500

Open and run the command file in the Gnuplot command line window by

load ’pl-v4mag.p’

A Gaussian curve will be fitted to the simulation data. The mean oscillator frequency and its
deviation are printed in the curve fitting log in the Gnuplot window.

Gnuplot script for data evaluation:

       # This file: pl-v4mag.p
       # ngspice file OpWien.sp
       # ngspice command:
       # gnuplot pl4mag v4mag xlimit 500 1500
       # a gnuplot manual:
       # http://www.duke.edu/~hpgavin/gnuplot.html

       # Gauss function to be fitted
       f1(x)=(c1/(a1*sqrt(2*3.14159))*exp(-((x-b1)**2)/(2*a1**2)))
       # Gauss function to plot start graph
       f2(x)=(c2/(a2*sqrt(2*3.14159))*exp(-((x-b2)**2)/(2*a2**2)))
       # start values
       a1=50 ; b1=900 ; c1=50
       # keep start values in a2, b2, c2
       a2=a1 b2=b1 ; c2=c1
       # curve fitting
       fit f1(x) ’pl4mag.data’ using 1:2 via a1, b1, c1
       # plot original and fitted curves with new a1, b1, c1
       plot "pl4mag.data" using 1:2 with lines, f1(x), f2(x)

pl4mag.data is the simulation data, f2(x) the starting curve, f1(x) the fitted Gaussian distribution.
This is just a simple example. You might explore the powerful built-in functions of Gnuplot to
do a much more sophisticated statistical data analysis.
