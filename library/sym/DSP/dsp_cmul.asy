Version 4
SymbolType CELL
RECTANGLE Normal -64 -80 64 80
LINE Normal -80 -48 -64 -48
TEXT -58 -48 Left 1 ar
LINE Normal -80 -16 -64 -16
TEXT -58 -16 Left 1 ai
LINE Normal -80 16 -64 16
TEXT -58 16 Left 1 br
LINE Normal -80 48 -64 48
TEXT -58 48 Left 1 bi
LINE Normal 64 -16 80 -16
TEXT 58 -16 Right 1 yr
LINE Normal 64 16 80 16
TEXT 58 16 Right 1 yi
TEXT 0 -66 Center 2 × I/Q
WINDOW 0 0 -88 Bottom 2
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
