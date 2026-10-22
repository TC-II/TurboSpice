# 5 Non-linear Dependent Sources (Behavioral

<!-- Fuente: manual de ngspice-47 (CC-BY-SA 4.0, ver ../README.md). Generado por scripts/ngspice-manual.mjs; no editar a mano. -->

Sources)

The non-linear dependent sources B ( see Chapt. 5.1), E (see 5.2), G see (5.3) described in this
chapter allow the generation of voltages or currents that result from evaluating a mathematical
expression. Internally E and G sources are converted to the more general B source. All three
sources may be used to introduce behavioral modeling and analysis.

## 5.1 Bxxxx: Nonlinear dependent source (ASRC)

### 5.1.1 Syntax and usage

General form:

        BXXXXXXX n+ n- <i=expr> <v=expr> <tc1=value> <tc2=value>
        + <temp=value> <dtemp=value>

Examples:

        B1 0 1 I=cos(v(1))+sin(v(2))
        B2 0 1 V=ln(cos(log(v(1,2)^2)))-v(3)^4+v(2)^v(1)
        B3 3 4 I=17
        B4 3 4 V=exp(pi^i(vdd))
        B5 2 0 V = V(1) < {Vlow} ? {Vlow} :
        + V(1) > {Vhigh} ? {Vhigh} : V(1)

n+ is the positive node, and n- is the negative node. The values of the V and I parameters
determine the voltages and currents across and through the device, respectively. If I is given
then the device is a current source, and if V is given the device is a voltage source. One and only
one of these parameters must be given. All instance parameters are listed in chapter 27.3.1.
A simple model is implemented for temperature behavior by the formula:
                                                                    
                I(T ) = I(TNOM) 1 + TC1 (T − TNOM) + TC2 (T − TNOM)2                         (5.1)

or
                                                                     
                                                                    2
               V (T ) = V (TNOM) 1 + TC1 (T − TNOM) + TC2 (T − TNOM)                         (5.2)

In the above formula, ‘T ’ represents the instance temperature, which can be explicitly set using
the temp keyword or calculated using the circuit temperature and dtemp, if present. If both
temp and dtemp are specified, the latter is ignored.

The small-signal AC behavior of the nonlinear source is a linear dependent source (or sources)
with a proportionality constant equal to the derivative (or derivatives) of the source at the DC
operating point. The expressions given for V and I may be any function of voltages and currents
through voltage sources in the system.
The following functions of a single real variable are defined:

Trigonometric functions: cos, sin, tan, acos, asin, atan

Hyperbolic functions: cosh, sinh, acosh, asinh, atanh

Exponential and logarithmic: exp, ln, log, log10 (ln, log with base e, log10 with base 10)

Other: abs, sqrt, u, u2, uramp, floor, ceil, i

Functions of two variables are min, max, pow, **, pwr, ^

Functions of three variables are a ? b:c

For convergence reasons the ‘exp’ function has a limit of 14 for its argument, beyond that value
it will increase linearily. The function ‘u’ is the unit step function, with a value of one for
arguments greater than zero, a value of 0.5 at zero, and a value of zero for arguments less than
zero. The function ‘u2’ returns a value of zero for arguments less than zero, one for arguments
greater than one and assumes the value of the argument between these limits. The function
‘uramp’ is the integral of the unit step: for an input x, the value is zero if x is less than zero,
or, if x is greater than or equal to zero, the value is x. These three functions are useful in
synthesizing piece-wise non-linear functions, though convergence may be adversely affected.
The function i(xyz) returns the current through the first node of device instance xyz.
The following standard operators are defined: +, -, *, /, ^, unary -
Logical operators are !=, <>, >=, <=, ==, >, <, ||, &&, !    .
A ternary function is defined as a ? b : c , which means IF a, THEN b, ELSE c. Be
sure to place a space in front of ‘?’ to allow the parser distinguishing it from other tokens.
The B source functions pow, **, ^, and pwr need some special care to avoid undefined regions
in x1, as they differ from the common mathematical usage (and from the functions depicted in
chapt. 2.11.5).
The functions y = pow(x1,x2), x1**x2, and x1^x2 , all of them describing y = x1x2 , resolve
to the following:

      y = pow(fabs(x1), x2)

pow in the preceding line is the standard C math library function.

The function y = pwr(x1,x2) resolves to

      if (x1 < 0.0)
        y = (-pow(-x1, x2));
      else
        y = (pow(x1, x2));

pow here again is the standard C math library function.

Example: Ternary function

      * B source test Clamped voltage source
      * C. P. Basso "Switched-mode power supplies", New York, 2008
      .param Vhigh = 4.6
      .param Vlow = 0.4
      Vin1 1 0 DC 0 PWL(0 0 1u 5)
      Bcl 2 0 V = V(1) < Vlow ? Vlow : V(1) > Vhigh ? Vhigh : V(1)
      .control
      unset askquit
      tran 5n 1u
      plot V(2) vs V(1)
      .endc
      .end

If the argument of log, ln, or sqrt becomes less than zero, the absolute value of the argument is
used. If a divisor becomes zero or the argument of log or ln becomes zero, an error will result.
Other problems may occur when the argument for a function in a partial derivative enters a
region where that function is undefined.

Parameters may be used like {Vlow} shown in the example above. Parameters will be evaluated
upon set up of the circuit, vectors like V(1) will be evaluated during the simulation.

To get time into the expression you can integrate the current from a constant current source
with a capacitor and use the resulting voltage (don’t forget to set the initial voltage across the
capacitor).

Non-linear resistors, capacitors, and inductors may be synthesized with the nonlinear dependent
source. Nonlinear resistors, capacitors and inductors are implemented with their linear counterparts
by a change of variables implemented with the nonlinear dependent source. The following
subcircuit will implement a nonlinear capacitor:

Example: Non linear capacitor

      .Subckt nlcap pos neg
      * Bx: calculate f(input voltage)
      Bx 1 0 v = f(v(pos,neg))
      * Cx: linear capacitance
      Cx 2 0 1
      * Vx: Ammeter to measure current into the capacitor
      Vx 2 1 DC 0Volts
      * Drive the current through Cx back into the circuit
      Fx pos neg Vx 1
      .ends

Example for f(v(pos,neg)):

      Bx 1 0 V = v(pos,neg)*v(pos,neg)

Non-linear resistors or inductors may be described in a similar manner. An example for a
nonlinear resistor using this template is shown below.

Example: Non linear resistor

      * use of ’hertz’ variable in nonlinear resistor
      *.param rbase=1k
      * some tests
      B1 1 0 V = hertz*v(33)
      B2 2 0 V = v(33)*hertz
      b3 3 0 V = 6.283e3/(hertz+6.283e3)*v(33)
      V1 33 0 DC 0 AC 1
      *** Translate R1 10 0 R=’1k/sqrt(HERTZ)’ to B source ***
      .Subckt nlres pos neg rb=rbase
      * Bx: calculate f(input voltage)
      Bx   1    0    v = -1 / {rb} / sqrt(HERTZ) * v(pos, neg)
      * Rx: linear resistance
      Rx   2    0    1

Example: Non linear resistor (continued)

        * Vx: Ammeter to measure current into the resistor
        Vx   2    1    DC 0Volts
        * Drive the current through Rx back into the circuit
        Fx   pos neg Vx 1
        .ends
        Xres 33 10 nlres rb=1k
        *Rres 33 10 1k
        Vres 10 0 DC 0
        .control
        define check(a,b) vecmax(abs(a - b))
        ac lin 10 100 1k
        * some checks
        print v(1) v(2) v(3)
        if check(v(1), frequency) < 1e-12
        echo "INFO: ok"
        end
        plot vres#branch
        .endc
        .end

### 5.1.2 Special B-Source Variables time, temper, hertz

The special variables time and temper are available in a transient analysis, reflecting the actual
simulation time and circuit temperature. temper returns the circuit temperature, given in degree
C (see 2.14). The variable hertz is available in an AC analysis. time is zero in the AC analysis,
hertz is zero during transient analysis. Using the variable hertz may cost some CPU time if
you have a large circuit, because for each frequency the operating point has to be determined
before calculating the AC response.

### 5.1.3 par(’expression’)

The B source syntax may also be used in output lines like .plot as algebraic expressions for
output (see Chapt.11.6.6 ).

### 5.1.4 Piecewise Linear Function: pwl

Both B source types may contain a piece-wise linear dependency of one network variable:
Example: pwl_current

        Bdio 1 0 I = pwl(v(A), 0,0, 33,10m, 100,33m, 200,50m)

v(A) is the independent variable x. Each pair of values following describes the x,y functional
relation: In this example at node A voltage of 0V the current of 0A is generated - next pair gives
10mA flowing from ground to node 1 at 33V on node A and so forth.

The same is possible for voltage sources:

Example: pwl_voltage

      Blimit b 0 V = pwl(v(1), -4,0, -2,2, 2,4, 4,5, 6,5)

Monotony of the independent variable in the pwl definition is checked - non-monotonic x entries
will stop the program execution. v(1) may be replaced by a controlling current source, or it may
be replaced by time (for transient simulations). v(1) may also be replaced by an expression,
e.g. −2 ∗ i(Vin ). The value pairs may also be parameters, and have to be predefined by a .param
statement. An example for the pwl function using all of these options is shown below.

                         Figure 5.1: pwl (piece-wise linear) B source

Example: pwl function in B source

     Demonstrates usage of the pwl function in an B source (ASRC)
     * Also emulates the TABLE function with limits

     .param x0=-4 y0=0
     .param x1=-2 y1=2
     .param x2=2 y2=-2
     .param x3=4 y3=1
     .param xx0=x0-1
     .param xx3=x3+1

     Vin ctrl 0      DC=0V
     R1 ctrl 0 2

     * no limits outside of the tabulated x values
     * (continues linearily)
     Btest2 2 0 I = pwl(v(ctrl),’x0’,’y0’,’x1’,’y1’,’x2’,’y2’,
     + ’x3’,’y3’)

     * like TABLE function with limits:
     Btest3 3 0 I = (v(ctrl) < ’x0’) ? ’y0’ : (v(ctrl) < ’x3’)
     + ? pwl(v(1),’x0’,’y0’,’x1’,’y1’,’x2’,’y2’,’x3’,’y3’) : ’y3’

     * more efficient and elegant TABLE function with limits
     *(voltage controlled):
     Btest4 4 0 I = pwl(v(ctrl),
     + ’xx0’,’y0’, ’x0’,’y0’,
     +             ’x1’,’y1’,
     +             ’x2’,’y2’,
     +             ’x3’,’y3’, ’xx3’,’y3’)
     *
     * more efficient and elegant TABLE function with limits
     * (controlled by current):
     Btest5 5 0 I = pwl(-2*i(Vin),
     + ’xx0’,’y0’, ’x0’,’y0’,
     +             ’x1’,’y1’,
     +             ’x2’,’y2’,
     +             ’x3’,’y3’, ’xx3’,’y3’)

     Rint2 2 0 1
     Rint3 3 0 1
     Rint4 4 0 1
     Rint5 5 0 1
     .control
     dc Vin -6 6 0.2
     plot v(2) v(3) v(4)-0.5 v(5)+0.5
     .endc

     .end

One characteristic to note: What happens when the controlling input (V(1) or −2 ∗ i(Vin )) is
outside of the given limits, e.g. smaller than x0 or larger than x3 in the example given above?
New y values outside of the given range will be determined by adding x,y pairs calculated by
extending the slope of the output curve, e.g. with (y3 − y2)/(x3 − x2), as seen with v(2) from
example Btest2. If you want to limit the function, keeping the last y value, e.g. y3, you have
to add another point (x,y pair) with slightly extended x and y kept constant, e.g. x3 + 1,y3.
This gets important when we are for example using a behavioral resistor with pwl. In the
example below, RR1 quickly moves towards (and beyond) 0, which is unphysical and leads the
transient simulation to fail, because the current through RR1 is unbounded. RR2 with its limit
given by the 15.1ms,1 couple avoids such malfunctioning.
Example: pwl function in behavioral resistor

        * pwl for behavioral R, transient sim
        VU1 3 0 DC 9
        RR1 3 0 R = pwl(time, 0,1, 7m,1, 8m,1.19, 14m,1.19, 15m,1)
        RR2 3 0 R = pwl(time, 0,1, 7m,1, 8m,1.19, 14m,1.19, 15m,1,
        + 15.1m,1)

        .tran 100u 20m 0
        .probe alli

        .control
        option noinit
        run
        display
        set xbrushwidth=2
        plot rr1#branch rr2#branch ylimit 7 17
        .endc

        .end

## 5.2 Exxxx: non-linear voltage source

### 5.2.1 VOL

General form:

        EXXXXXXX n+ n- vol=’expr’

Examples:

        E41 4 0 vol = ’V(3)*V(3)-Offs’

Expression may be an equation or an expression containing node voltages or branch currents
(in the form of i(vm)) and any other terms as given for the B source and described in Chapt.

5.1. It may contain parameters (2.11.1) and the special variables time, temper, hertz (5.1.2).
’ or { } may be used to delimit the function.

### 5.2.2 VALUE

Optional syntax:

        EXXXXXXX n+ n- value={expr}

Examples:

        E41 4 0 value = {V(3)*V(3)-Offs}

The ’=’ sign is optional.

### 5.2.3 TABLE

Data may be entered from the listings of a data table similar to the pwl B-Source (5.1.4). Data
are grouped into x, y pairs. Expression may be an equation or an expression containing node
voltages or branch currents (in the form of i(vm)) and any other terms as given for the B source
and described in Chapt. 5.1. It may contain parameters (2.11.1). ’ or { } may be used to delimit
the function. Expression delivers the x-value, which is used to generate a corresponding y-value
according to the tabulated value pairs, using linear interpolation. If the x-value is below x0 , y0
is returned, above x2 y2 is returned (limiting function). The value pairs have to be real numbers,
parameters are not allowed.
Syntax for data entry from table:

        Exxx n1 n2 TABLE {expression} = (x0, y0) (x1, y1) (x2, y2)

Example (simple comparator):

        ECMP 11 0 TABLE {V(10,9)} = (-5mV, 0V) (5mV, 5V)

An ’=’ sign may follow the keyword TABLE.
An alternative syntax is available as well:
Alternative syntax for data entry from table:

        Exxx n1 n2 nc1 nc2 TABLE = (x0, y0, x1, y1, x2, y2)

Example (nonlinear gain):

        Egain out11 0 in1 in2 TABLE = (0, 0, 1, 1, 2, 4)

### 5.2.4 POLY

see E-Source at Chapt. 5.5.

### 5.2.5 LAPLACE

Currently ngspice does not offer a direct E-Source element with the LAPLACE option. There
is however a XSPICE code model equivalent called s_xfer (see Chapt. 8.2.18), which you
may invoke manually. The XSPICE option has to be enabled (28.1). AC (11.3.1) and transient
analysis (11.3.10) is supported.

The following E-Source:

        ELOPASS 4 0 LAPLACE {V(1)}
        +                   {5 * (s/100 + 1) / (s^2/42000 + s/60 + 1)}

may be replaced by:

        AELOPASS 1 int_4 filter1
        .model filter1 s_xfer(gain=5
        +                    num_coeff=[{1/100} 1]
        +                    den_coeff=[{1/42000} {1/60} 1]
        +                    int_ic=[0 0])
        ELOPASS 4 0 int_4 0 1

where you have the voltage of node 1 as input, an intermediate output node int_4 and an E-
source as buffer to keep the name ‘ELOPASS’ available if further processing is required.

If the controlling expression is more complex than just a voltage node, you may add a B-Source
(5.1) for evaluating the expression before entering the A-device.

E-Source with complex controlling expression:

        ELOPASS 4 0 LAPLACE {V(1)*v(2)} {10 / (s/6800 + 1)}

may be replaced by:

        BELOPASS int_1 0 V=V(1)*v(2)
        AELOPASS int_1 int_4 filter1
        .model filter1 s_xfer(gain=10
        +                    num_coeff=[1]
        +                    den_coeff=[{1/6800} 1]
        +                    int_ic=[0])
        ELOPASS 4 0 int_4 0 1

### 5.2.6 FREQ

Currently ngspice does not offer a direct E-Source element with the FREQ option but it is
implemented by a XSPICE code model equivalent called xfer (see 8.2.19) that is automatically
invoked by rewriting the netlist. The XSPICE option has to be enabled (28.1) and only AC
(11.3.1) analysis is supported.

This E-Source:

        EXFER 1 0 FREQ {V(20,21)}= DB
        +(1.000000e+07Hz, 1.633257e-07, -1.859873e+01)
        +(1.025641e+08Hz, -4.165672e+00, -4.076855e+02)
        +(2.000000e+08Hz, -2.798303e-05, -7.519027e+02)

produces a complex voltage determined by multiplying an input differential voltage (v(20, 21))
by a complex-valued PWL function of the simulation frequency (transfer function). The DB
keyword indicates that the second column is gain in db and the third is phase in degrees. Alternative
keywords are MAG (linear gain), RAD (phase in radians), DEG (phase in degrees,
already the default) or R_I (real and imaginary parts).

### 5.2.7 AND/OR/NAND/NOR

This form of E-source provides simple behavioural implementations of basic logic gates with
analog inputs and output. It is implemented by a XSPICE code model called multi_input_pwl
(see 8.2.10) that is automatically invoked by rewriting the netlist. The XSPICE option has to be
enabled (28.1).

This E-Source:

        EAND out1 out0 and(2) in1 0 in2 0 (0.5, 0) (2.8, 3.3)

produces a differential output voltage determined by selecting the smallest of any number of
differential input voltages, and applying a PWL output function. Here “and(2)” determines the
logic function and number of PWL points: output is zero for minimum input voltage less than
0.5 and 3.3 for inputs greater than 2.8, with a linear ramp between. The other three functions
are similar: “or” selects the maximum input and “nand/nor” reverse the order of PWL points.
Only two points are supported.

An example circuit can be found at examples/digital/compare/adder_esource.cir.

## 5.3 Gxxxx: non-linear current source

### 5.3.1 CUR

General form:

        GXXXXXXX n+ n- cur=’expr’ <m=val>

Examples:

        G51 55 225 cur = ’V(3)*V(3)-Offs’

Expression may be an equation or an expression containing node voltages or branch currents
(in the form of i(vm)) and any other terms as given for the B source and described in Chapt.
5.1. It may contain parameters (2.11.1) and special variables (5.1.2). m is an optional multiplier
to the output current. val may be a numerical value or an expression according to 2.11.5
containing only references to other parameters (no node voltages or branch currents!), because
it is evaluated before the simulation commences.

### 5.3.2 VALUE

Optional syntax:

        GXXXXXXX n+ n- value=’expr’ <m=val>

Examples:

        G51 55 225 value = ’V(3)*V(3)-Offs’

The ’=’ sign is optional.

### 5.3.3 TABLE

A data entry by a tabulated listing is available with syntax similar to the E-Source (see Chapt.
5.2.3).
Syntax for data entry from table:

        Gxxx n1 n2 TABLE {expression} =
        + (x0, y0) (x1, y1) (x2, y2) <m=val>

Example (simple comparator with current output and voltage control):

        GCMP 0 11 TABLE {V(10,9)} = (-5MV, 0V) (5MV, 5V)
        R 11 0 1k

m is an optional multiplier to the output current. val may be a numerical value or an expression
according to 2.11.5 containing only references to other parameters (no node voltages or branch
currents!), because it is evaluated before the simulation commences. An ’=’ sign may follow
the keyword TABLE.

### 5.3.4 POLY

see E-Source at Chapt. 5.5.

### 5.3.5 LAPLACE

See E-Source, Chapt. 5.2.5 , for an equivalent code model replacement.

### 5.3.6 FREQ

See E-Source, Chapt.5.2.6 , for an equivalent code model replacement.

### 5.3.7 Example

An example file is given below.

Example input file:

      VCCS, VCVS, non-linear dependency
      .param Vi=1
      .param Offs=’0.01*Vi’
      * VCCS depending on V(3)
      B21 int1 0 V = V(3)*V(3)
      G1 21 22 int1 0 1
      * measure current through VCCS
      vm 22 0 dc 0
      R21 21 0 1
      * new VCCS depending on V(3)
      G51 55 225 cur = ’V(3)*V(3)-Offs’
      * measure current through VCCS
      vm5 225 0 dc 0
      R51 55 0 1
      * VCVS depending on V(3)
      B31 int2 0 V = V(3)*V(3)
      E1 1 0 int2 0 1
      R1 1 0 1
      * new VCVS depending on V(3)
      E41 4 0 vol = ’V(3)*V(3)-Offs’
      R4 4 0 1
      * control voltage
      V1 3 0 PWL(0 0 100u {Vi})
      .control
      unset askquit
      tran 10n 100u uic
      plot i(E1) i(E41)
      plot i(vm) i(vm5)
      .endc
      .end

## 5.4 Debugging a behavioral source

The B, E, G, sources and the behavioral R, C, L elements are powerful tools to set up user
defined models. Unfortunately debugging these models is not very comfortable.

Example input file with bug (log(-2)):

      B source debugging

      V1 1 0 1
      V2 2 0 -2

      E41 4 0 vol = ’V(1)*log(V(2))’

      .control
      tran 1 1
      .endc

      .end

The input file given above results in an error message:

Error:    -2 out of range for log

In this trivial example, the reason and location for the bug is obvious. However, if you have
several equations using behavioral sources, and several occurrences of the log function, then
debugging is nearly impossible.

However, if the variable ngdebug (see 13.7) is set (e.g. in file .spiceinit), a more distinctive
error message is issued that (after some closer investigation) will reveal the location and value
of the buggy parameter.

Detailed error message for input file with bug (log(-2)):

      Error: -2 out of range for log
      calling PTeval, tree =
              (v0) * (log (v1))
      d / d v0 : log (v1)
      d / d v1 : (v0) * ((0.434294) / (v1))
      values:   var0 = 1
                var1 = -2

If variable strict_errorhandling (see 13.7) is set, ngspice exits after this message. If not,
gmin and source stepping may be started, typically without success.

## 5.5 POLY Sources

Polynomial sources are only available when the XSPICE option (see Chapt. 28) is not disabled.

### 5.5.1 E voltage source, G current source

General form:

        EXXXX N+ N- POLY(ND) NC1+ NC1- (NC2+ NC2-...) P0 (P1...)

Example:

        ENONLIN 100 101 POLY(2) 3 0 4 0 0.0 13.6 0.2 0.005

POLY(ND) Specifies the number of dimensions of the polynomial. The number of pairs of
controlling nodes must be equal to the number of dimensions.
(N+) and (N-) nodes are output nodes. Positive current flows from the (+) node through the
source to the (-) node.
The <NC1+> and <NC1-> are in pairs and define a set of controlling voltages. A particular node
can appear more than once, and the output and controlling nodes need not be different.
The example yields a voltage output controlled by two input voltages v(3,0) and v(4,0). Four
polynomial coefficients are given. The equivalent function to generate the output is:

        0 + 13.6 * v(3) + 0.2 * v(4) + 0.005 * v(3) * v(3)

Generally you will set the equation according to

        POLY(1) y = p0 + p1*X1 + p2*X1*X1     + p3*X1*X1*X1 + ...
        POLY(2) y = p0 + p1*X1         + p2*X2 +
                       + p3*X1*X1      + p4*X2*X1    + p5*X2*X2    +
                       + p6*X1*X1*X1   + p7*X2*X1*X1 + p8*X2*X2*X1 +
                       + p9*X2*X2*X2   + ...
        POLY(3) y = p0 + p1*X1    + p2*X2    + p3*X3    +
                       + p4*X1*X1 + p5*X2*X1 + p6*X3*X1 +
                       + p7*X2*X2 + p8*X2*X3 + p9*X3*X3 + ...

where X1 is the voltage difference of the first input node pair, X2 of the second pair and so on.
Keeping track of all polynomial coefficient is rather tedious for large polynomials.

### 5.5.2 F voltage source, H current source

General form:

        FXXXX N+ N- POLY(ND) V1 (V2 V3 ...) P0 (P1...)

Example:

        FNONLIN 100 101 POLY(2) VDD Vxx 0 0.0 13.6 0.2 0.005

POLY(ND) Specifies the number of dimensions of the polynomial. The number of controlling
sources must be equal to the number of dimensions.
(N+) and (N-) nodes are output nodes. Positive current flows from the (+) node through the
source to the (-) node.
V1 (V2 V3 ...) are the controlling voltage sources. Control variable is the current through these
sources.
P0 (P1...) are the coefficients, as have been described in 5.5.1.
