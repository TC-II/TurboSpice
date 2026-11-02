Version 4
SymbolType CELL
RECTANGLE Normal -64 -16 64 16
WINDOW 0 0 -24 Bottom 2
WINDOW 3 0 24 Top 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n STEP=0 VALUE=16384 W=16
SYMATTR Prefix X
SYMATTR Value dsp_impulse
SYMATTR ModelFile dsp_impulse.sub
SYMATTR Description Verilog module dsp_impulse
PIN -64 0 LEFT 8
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 64 0 RIGHT 8
PINATTR PinName y[15:0]
PINATTR SpiceOrder 2
