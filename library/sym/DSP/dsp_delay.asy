Version 4
SymbolType CELL
RECTANGLE Normal -48 -32 48 32
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 40 Top 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n W=16
SYMATTR Prefix X
SYMATTR Value dsp_delay
SYMATTR ModelFile dsp_delay.sub
SYMATTR Description Verilog module dsp_delay
PIN -48 -16 LEFT 8
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN -48 16 LEFT 8
PINATTR PinName d[15:0]
PINATTR SpiceOrder 2
PIN 48 -16 RIGHT 8
PINATTR PinName q[15:0]
PINATTR SpiceOrder 3
