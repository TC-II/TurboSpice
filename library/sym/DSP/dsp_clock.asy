Version 4
SymbolType CELL
RECTANGLE Normal -32 -24 32 24
LINE Normal 32 0 64 0
LINE Normal -20 8 -10 8
LINE Normal -10 8 -10 -8
LINE Normal -10 -8 0 -8
LINE Normal 0 -8 0 8
LINE Normal 0 8 10 8
LINE Normal 10 8 10 -8
LINE Normal 10 -8 20 -8
LINE Normal 54 -4 60 0
LINE Normal 60 0 54 4
WINDOW 0 0 -32 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n PERIOD=1000 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_clock
SYMATTR ModelFile dsp_clock.sub
SYMATTR Description Verilog module dsp_clock
PIN 64 0 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
