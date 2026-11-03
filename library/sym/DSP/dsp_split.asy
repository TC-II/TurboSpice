Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 x
LINE Normal 64 -16 80 -16
TEXT 58 -16 Right 1 hi
LINE Normal 64 16 80 16
TEXT 58 16 Right 1 lo
TEXT 0 -36 Center 1 split
LINE Normal -16 0 16 -10
LINE Normal -16 0 16 10
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
SYMATTR Value dsp_split
SYMATTR ModelFile dsp_split.sub
SYMATTR Description Verilog module dsp_split
PIN -80 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 1
PIN 80 -16 NONE 0
PINATTR PinName hi[7:0]
PINATTR SpiceOrder 2
PIN 80 16 NONE 0
PINATTR PinName lo[7:0]
PINATTR SpiceOrder 3
