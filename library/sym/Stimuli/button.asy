Version 4
SymbolType CELL
RECTANGLE Normal -64 -32 64 32
TEXT 0 -20 Center 1 BUTTON
LINE Normal 64 0 96 0
TEXT 60 0 Right 1 y
WINDOW 0 0 -40 Bottom 2
WINDOW 3 0 0 Invisible 2
SYMATTR SpiceLine vcc=5 vil={0.3*vcc} vih={0.7*vcc} vol=0 voh={vcc} iol=4m ioh=4m tr=6n tf=6n tpd=9n ACTIVE=0 N_BOUNCE=6 SEED=1 T_BOUNCE=2000 T_HOLD=20000 T_PRESS=1000 hdl=auto
SYMATTR Prefix X
SYMATTR Value button
SYMATTR ModelFile button.sub
SYMATTR Description Push button with contact bounce (press at T_PRESS µs, release T_HOLD µs later; N_BOUNCE bounces in about T_BOUNCE µs)
PIN 96 0 NONE 0
PINATTR PinName y
PINATTR SpiceOrder 1
