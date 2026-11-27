// 74HC125: buffer de tres estados (uno de los cuatro del integrado): con OE_n en 1, Y queda en Z.
module hc125 (input A, input OE_n, output Y);
  assign Y = OE_n ? 1'bz : A;
endmodule
