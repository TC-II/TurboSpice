// 74HC161: contador binario de 4 bits con carga (LOAD_n, sincrónica) y clear asincrónico (CLR_n);
// cuenta con ENP y ENT en 1, y RCO = 1 en 15 con ENT en 1.
module hc161 (input CLK, input CLR_n, input LOAD_n, input ENP, input ENT, input A, input B, input C, input D,
              output QA, output QB, output QC, output QD, output RCO);
  reg [3:0] q;
  always @(posedge CLK or negedge CLR_n)
    if (!CLR_n) q <= 4'd0;
    else if (!LOAD_n) q <= {D, C, B, A};
    else if (ENP & ENT) q <= q + 4'd1;
  assign {QD, QC, QB, QA} = q;
  assign RCO = ENT & (q == 4'd15);
endmodule
