Version 4
SymbolType CELL
CIRCLE Normal -28 -28 28 28
TEXT 0 -4 Center 3 ×
TEXT 0 16 Center 1 I/Q
LINE Normal -80 -48 -44 -48
LINE Normal -44 -48 -19 -21
TEXT -56 -56 Center 0 ar
LINE Normal -80 -16 -44 -16
LINE Normal -44 -16 -26 -10
TEXT -56 -24 Center 0 ai
LINE Normal -80 16 -44 16
LINE Normal -44 16 -26 10
TEXT -56 8 Center 0 br
LINE Normal -80 48 -44 48
LINE Normal -44 48 -19 21
TEXT -56 40 Center 0 bi
LINE Normal 80 -16 44 -16
LINE Normal 44 -16 26 -10
TEXT 56 -24 Center 0 yr
LINE Normal 80 16 44 16
LINE Normal 44 16 26 10
TEXT 56 8 Center 0 yi
LINE Normal -74 -52 -68 -48
LINE Normal -68 -48 -74 -44
LINE Normal -74 -20 -68 -16
LINE Normal -68 -16 -74 -12
LINE Normal -74 12 -68 16
LINE Normal -68 16 -74 20
LINE Normal -74 44 -68 48
LINE Normal -68 48 -74 52
LINE Normal 70 -20 76 -16
LINE Normal 76 -16 70 -12
LINE Normal 70 12 76 16
LINE Normal 76 16 70 20
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={vcc/2} vih={vcc/2} vol=0 voh={vcc} iol=20m ioh=20m tr=1n tf=1n tpd=1n F=15 SAT=1 W=16 hdl=auto
SYMATTR Prefix X
SYMATTR Value dsp_cmul
SYMATTR ModelFile dsp_cmul.sub
SYMATTR Description Verilog module dsp_cmul
PIN -80 -48 NONE 0
PINATTR PinName ar[15:0]
PINATTR SpiceOrder 1
PIN -80 -16 NONE 0
PINATTR PinName ai[15:0]
PINATTR SpiceOrder 2
PIN -80 16 NONE 0
PINATTR PinName br[15:0]
PINATTR SpiceOrder 3
PIN -80 48 NONE 0
PINATTR PinName bi[15:0]
PINATTR SpiceOrder 4
PIN 80 -16 NONE 0
PINATTR PinName yr[15:0]
PINATTR SpiceOrder 5
PIN 80 16 NONE 0
PINATTR PinName yi[15:0]
PINATTR SpiceOrder 6
