Version 4
SymbolType CELL
RECTANGLE Normal -24 44 -8 84
LINE Normal -16 32 -16 44
LINE Normal -16 84 -16 96
LINE Normal -30 76 -2 52
LINE Normal -2 52 4 52
LINE Normal -32 48 -24 48
LINE Normal -32 80 -24 80
WINDOW 0 0 32 Left 2
WINDOW 3 0 104 Left 2
SYMATTR Prefix A
SYMATTR SpiceModel VARISTOR
SYMATTR Description Voltage-controlled varistor: clamps |V(out)| to |V(invin,noninvin)| through rclamp
PIN -32 48 NONE 0
PINATTR PinName invin
PINATTR SpiceOrder 1
PIN -32 80 NONE 0
PINATTR PinName noninvin
PINATTR SpiceOrder 2
PIN -16 32 NONE 0
PINATTR PinName out
PINATTR SpiceOrder 7
PIN -16 96 NONE 0
PINATTR PinName com
PINATTR SpiceOrder 8
