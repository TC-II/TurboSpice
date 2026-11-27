// 74HC138: decodificador de 3 a 8 con salidas activas en bajo; habilitado con G1 = 1, G2A_n = 0 y G2B_n = 0.
module hc138 (input A, input B, input C, input G1, input G2A_n, input G2B_n,
              output Y0_n, output Y1_n, output Y2_n, output Y3_n, output Y4_n, output Y5_n, output Y6_n, output Y7_n);
  wire en = G1 & ~G2A_n & ~G2B_n;
  wire [2:0] s = {C, B, A};
  assign {Y7_n, Y6_n, Y5_n, Y4_n, Y3_n, Y2_n, Y1_n, Y0_n} = ~({7'b0, en} << s);
endmodule
