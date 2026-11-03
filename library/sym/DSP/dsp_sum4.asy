Version 4
SymbolType CELL
CIRCLE Normal -28 -28 28 28
TEXT 0 0 Center 3 Σ
LINE Normal -80 -48 -44 -48
LINE Normal -44 -48 -19 -21
TEXT -56 -56 Center 0 a
LINE Normal -80 -16 -44 -16
LINE Normal -44 -16 -26 -10
TEXT -56 -24 Center 0 b
LINE Normal -80 16 -44 16
LINE Normal -44 16 -26 10
TEXT -56 8 Center 0 c
LINE Normal -80 48 -44 48
LINE Normal -44 48 -19 21
TEXT -56 40 Center 0 d
LINE Normal 80 0 44 0
LINE Normal 44 0 28 0
TEXT 56 -8 Center 0 y
LINE Normal -74 -52 -68 -48
LINE Normal -68 -48 -74 -44
LINE Normal -74 -20 -68 -16
LINE Normal -68 -16 -74 -12
LINE Normal -74 12 -68 16
LINE Normal -68 16 -74 20
LINE Normal -74 44 -68 48
LINE Normal -68 48 -74 52
LINE Normal 70 -4 76 0
LINE Normal 76 0 70 4
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n SAT=1 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_sum4
SYMATTR ModelFile dsp_sum4.sub
SYMATTR Description Verilog module dsp_sum4
PIN -80 -48 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 1
PIN -80 -16 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 2
PIN -80 16 NONE 0
PINATTR PinName c[15:0]
PINATTR SpiceOrder 3
PIN -80 48 NONE 0
PINATTR PinName d[15:0]
PINATTR SpiceOrder 4
PIN 80 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 5
