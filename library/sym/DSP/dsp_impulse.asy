Version 4
SymbolType CELL
RECTANGLE Normal -32 -32 32 32
LINE Normal -8 32 0 22
LINE Normal 0 22 8 32
LINE Normal 0 32 0 64
TEXT 0 -4 Center 3 
LINE Normal 32 0 64 0
LINE Normal -20 12 20 12
LINE Normal -6 12 -6 -18
CIRCLE Normal -10 -22 -2 -14
TEXT 10 -6 Center 2 δ
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n STEP=0 VALUE=16384 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_impulse
SYMATTR ModelFile dsp_impulse.sub
SYMATTR Description Verilog module dsp_impulse
PIN 0 64 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 64 0 NONE 0
PINATTR PinName y[15:0]
PINATTR SpiceOrder 2
