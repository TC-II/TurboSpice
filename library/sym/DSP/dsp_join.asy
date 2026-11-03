Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal -80 -16 -64 -16
TEXT -58 -16 Left 1 hi
LINE Normal -80 16 -64 16
TEXT -58 16 Left 1 lo
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 y
TEXT 0 -36 Center 1 join
LINE Normal -16 -10 16 0
LINE Normal -16 10 16 0
LINE Normal -74 -20 -68 -16
LINE Normal -68 -16 -74 -12
LINE Normal -74 12 -68 16
LINE Normal -68 16 -74 20
LINE Normal 70 -4 76 0
LINE Normal 76 0 70 4
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_join
SYMATTR ModelFile dsp_join.sub
SYMATTR Description Verilog module dsp_join
PIN -80 -16 NONE 0
PINATTR PinName hi[7:0]
PINATTR SpiceOrder 1
PIN -80 16 NONE 0
PINATTR PinName lo[7:0]
PINATTR SpiceOrder 2
PIN 80 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 3
