Version 4
SymbolType CELL
RECTANGLE Normal -64 -32 64 32
LINE Normal -80 0 -64 0
TEXT -58 0 Left 1 x
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 y
LINE Normal -16 32 -16 64
LINE Normal -24 32 -16 22
LINE Normal -16 22 -8 32
LINE Normal 16 32 16 64
TEXT 16 22 Center 1 clr
TEXT 0 -20 Center 1 ∫
LINE Normal -20 12 -12 8
LINE Normal -12 8 -4 2
LINE Normal -4 2 4 -4
LINE Normal 4 -4 12 -8
LINE Normal 12 -8 20 -10
LINE Normal -74 -4 -68 0
LINE Normal -68 0 -74 4
LINE Normal 70 -4 76 0
LINE Normal 76 0 70 4
LINE Normal -12 58 -16 52
LINE Normal -16 52 -20 58
LINE Normal 20 58 16 52
LINE Normal 16 52 12 58
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n SAT=0 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_integrator
SYMATTR ModelFile dsp_integrator.sub
SYMATTR Description Verilog module dsp_integrator
PIN -16 64 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 16 64 NONE 0
PINATTR PinName clr
PINATTR SpiceOrder 2
PIN -80 0 NONE 0
PINATTR PinName x[15:0]
PINATTR SpiceOrder 3
PIN 80 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 4
