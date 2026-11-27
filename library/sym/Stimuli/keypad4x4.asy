Version 4
SymbolType CELL
RECTANGLE Normal -64 -80 64 80
TEXT 0 -68 Center 1 KEYPAD 4×4
LINE Normal -64 -48 -96 -48
TEXT -60 -48 Left 1 R1
LINE Normal -64 -16 -96 -16
TEXT -60 -16 Left 1 R2
LINE Normal -64 16 -96 16
TEXT -60 16 Left 1 R3
LINE Normal -64 48 -96 48
TEXT -60 48 Left 1 R4
LINE Normal 64 -48 96 -48
TEXT 60 -48 Right 1 C1
LINE Normal 64 -16 96 -16
TEXT 60 -16 Right 1 C2
LINE Normal 64 16 96 16
TEXT 60 16 Right 1 C3
LINE Normal 64 48 96 48
TEXT 60 48 Right 1 C4
WINDOW 0 0 -88 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n T_FIRST=1000 T_GAP=20000 T_HOLD=20000 hdl=auto
SYMATTR Prefix X
SYMATTR Value keypad4x4
SYMATTR ModelFile keypad4x4.sub
SYMATTR Description 4×4 matrix keypad: scan rows R1–R4 (active low), read columns C1–C4; presses the keys of KEYS in order (set in the code)
PIN -96 -48 NONE 0
PINATTR PinName r1
PINATTR SpiceOrder 1
PIN -96 -16 NONE 0
PINATTR PinName r2
PINATTR SpiceOrder 2
PIN -96 16 NONE 0
PINATTR PinName r3
PINATTR SpiceOrder 3
PIN -96 48 NONE 0
PINATTR PinName r4
PINATTR SpiceOrder 4
PIN 96 -48 NONE 0
PINATTR PinName c1
PINATTR SpiceOrder 5
PIN 96 -16 NONE 0
PINATTR PinName c2
PINATTR SpiceOrder 6
PIN 96 16 NONE 0
PINATTR PinName c3
PINATTR SpiceOrder 7
PIN 96 48 NONE 0
PINATTR PinName c4
PINATTR SpiceOrder 8
