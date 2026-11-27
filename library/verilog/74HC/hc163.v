// 74HC163: como el 74HC161, pero el clear (CLR_n) también es sincrónico: actúa en el flanco de CLK.
module hc163 (input CLK, input CLR_n, input LOAD_n, input ENP, input ENT, input A, input B, input C, input D,
              output QA, output QB, output QC, output QD, output RCO);
  reg [3:0] q;
  always @(posedge CLK)
    if (!CLR_n) q <= 4'd0;
    else if (!LOAD_n) q <= {D, C, B, A};
    else if (ENP & ENT) q <= q + 4'd1;
  assign {QD, QC, QB, QA} = q;
  assign RCO = ENT & (q == 4'd15);
endmodule
