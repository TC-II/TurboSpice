// 74HC74: flip-flop D por flanco de subida, con preset y clear asincrónicos activos en bajo (uno
// de los dos del integrado). Con PRE_n y CLR_n en 0 a la vez, Q y Q_n quedan en 1; al soltar uno,
// manda el otro.
module hc74 (input D, input CLK, input PRE_n, input CLR_n, output Q, output Q_n);
  reg q;
  always @(posedge CLK or negedge PRE_n or negedge CLR_n)
    if (!CLR_n) q <= 1'b0;
    else if (!PRE_n) q <= 1'b1;
    else q <= D;
  // synthesis translate_off
  // (Icarus: soltar clear con preset en bajo deja Q en 1, como el set y reset por nivel de la síntesis)
  always @(posedge CLR_n) if (!PRE_n) q <= 1'b1;
  // synthesis translate_on
  assign Q = q | ~PRE_n;
  assign Q_n = ~q | ~CLR_n;
endmodule
