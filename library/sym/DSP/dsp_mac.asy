Version 4
SymbolType CELL
RECTANGLE Normal -64 -48 64 48
LINE Normal -80 -16 -64 -16
TEXT -58 -16 Left 1 a
LINE Normal -80 16 -64 16
TEXT -58 16 Left 1 b
LINE Normal 64 0 80 0
TEXT 58 0 Right 1 acc
LINE Normal -16 48 -16 80
LINE Normal -24 48 -16 38
LINE Normal -16 38 -8 48
LINE Normal 16 48 16 80
TEXT 16 38 Center 1 clr
TEXT 0 -34 Center 2 MAC
LINE Normal -74 -20 -68 -16
LINE Normal -68 -16 -74 -12
LINE Normal -74 12 -68 16
LINE Normal -68 16 -74 20
LINE Normal 70 -4 76 0
LINE Normal 76 0 70 4
LINE Normal -12 74 -16 68
LINE Normal -16 68 -20 74
LINE Normal 20 74 16 68
LINE Normal 16 68 12 74
WINDOW 0 0 -56 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n F=15 RND=1 SAT=1 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_mac
SYMATTR ModelFile dsp_mac.sub
SYMATTR Description Verilog module dsp_mac
PIN -16 80 NONE 0
PINATTR PinName clk
PINATTR SpiceOrder 1
PIN 16 80 NONE 0
PINATTR PinName clr
PINATTR SpiceOrder 2
PIN -80 -16 NONE 0
PINATTR PinName a[15:0]
PINATTR SpiceOrder 3
PIN -80 16 NONE 0
PINATTR PinName b[15:0]
PINATTR SpiceOrder 4
PIN 80 0 NONE 0
PINATTR PinName acc[15:0]
PINATTR SpiceOrder 5
