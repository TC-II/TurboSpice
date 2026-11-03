Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 x
LINE Normal 64 -16 80 -16
TEXT 58 -16 Right 1 y
LINE Normal 64 16 80 16
TEXT 58 16 Right 1 valid
LINE Normal 0 48 0 80
LINE Normal -8 48 0 38
LINE Normal 0 38 8 48
TEXT 0 -36 Center 1 CIC ↓R
LINE Normal -16 -8 -12 -11
LINE Normal -12 -11 -8 -8
LINE Normal -8 -8 -4 -5
LINE Normal -4 -5 0 -8
LINE Normal 0 -8 4 -11
LINE Normal 4 -11 8 -8
LINE Normal 8 -8 12 -5
LINE Normal 12 -5 16 -8
LINE Normal -16 0 -12 -3
LINE Normal -12 -3 -8 0
LINE Normal -8 0 -4 3
LINE Normal -4 3 0 0
LINE Normal 0 0 4 -3
LINE Normal 4 -3 8 0
LINE Normal 8 0 12 3
LINE Normal 12 3 16 0
LINE Normal -16 8 -12 5
LINE Normal -12 5 -8 8
LINE Normal -8 8 -4 11
LINE Normal -4 11 0 8
LINE Normal 0 8 4 5
LINE Normal 4 5 8 8
LINE Normal 8 8 12 11
LINE Normal 12 11 16 8
LINE Normal -8 12 8 -12
LINE Normal -74 -4 -68 0
LINE Normal -68 0 -74 4
LINE Normal 70 -20 76 -16
LINE Normal 76 -16 70 -12
LINE Normal 70 12 76 16
LINE Normal 76 16 70 20
LINE Normal 4 74 0 68
LINE Normal 0 68 -4 74
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n N=2 R=8 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_cic
SYMATTR ModelFile dsp_cic.sub
SYMATTR Description Verilog module dsp_cic
PIN 0 80 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -80 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 2
PIN 80 -16 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 3
PIN 80 16 NONE 0
PINATTR PinName valid
PINATTR SpiceOrder 4
