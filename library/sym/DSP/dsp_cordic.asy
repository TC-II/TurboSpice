Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 phase
LINE Normal 64 -16 80 -16
TEXT 58 -16 Right 1 cos
LINE Normal 64 16 80 16
TEXT 58 16 Right 1 sin
TEXT 0 -36 Center 1 CORDIC
LINE Normal -20 0 -16 -5
LINE Normal -16 -5 -12 -8
LINE Normal -12 -8 -8 -8
LINE Normal -8 -8 -4 -5
LINE Normal -4 -5 0 0
LINE Normal 0 0 4 5
LINE Normal 4 5 8 8
LINE Normal 8 8 12 8
LINE Normal 12 8 16 5
LINE Normal 16 5 20 0
LINE Normal -20 -8 -16 -6
LINE Normal -16 -6 -12 -2
LINE Normal -12 -2 -8 2
LINE Normal -8 2 -4 6
LINE Normal -4 6 0 8
LINE Normal 0 8 4 6
LINE Normal 4 6 8 2
LINE Normal 8 2 12 -2
LINE Normal 12 -2 16 -6
LINE Normal 16 -6 20 -8
LINE Normal -74 -4 -68 0
LINE Normal -68 0 -74 4
LINE Normal 70 -20 76 -16
LINE Normal 76 -16 70 -12
LINE Normal 70 12 76 16
LINE Normal 76 16 70 20
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_cordic
SYMATTR ModelFile dsp_cordic.sub
SYMATTR Description Verilog module dsp_cordic
PIN -80 0 NONE 0
PINATTR PinName phase[15:0]
PINATTR SpiceOrder 1
PIN 80 -16 NONE 0
PINATTR PinName cos[15:0]
PINATTR SpiceOrder 2
PIN 80 16 NONE 0
PINATTR PinName sin[15:0]
PINATTR SpiceOrder 3
