// Control logic of the 8-bit SAR ADC (successive approximation register).
// One conversion takes 10 clock cycles, in three phases that never overlap:
//   1 sample: smp = 1 closes the top-plate switch (top on vcm) and the input switches (bottom
//             plates on vin): each capacitor charges to vin − vcm.
//   1 hold:   every switch opens: the floating top plate keeps that charge, which is the sample.
//   8 trials: b is the code being tried, bit 7 first. The bits at 1 put their bottom plate on vref
//             (up) and the ones at 0 on ground (dn); then cmp says whether vin is still above that
//             trial voltage: if it is the bit stays, if not it goes back to 0, and the next bit is tried.
// At the end the result goes to data, eoc is 1 for one cycle and the next sample starts.
module SARLOGIC (
  input clk,
  input cmp,
  output reg smp,
  output reg [7:0] up,
  output reg [7:0] dn,
  output reg eoc,
  output reg [7:0] data
);
  reg [7:0] b = 0;      // the successive-approximation register
  reg [7:0] trial = 0;  // the bit being tried (one-hot)
  reg hold = 0;
  initial smp = 1;
  initial up = 0;
  initial dn = 0;
  initial eoc = 0;
  initial data = 0;
  wire [7:0] decided = cmp ? b : b & ~trial;
  wire [7:0] next = decided | (trial >> 1);
  always @(posedge clk) begin
    eoc <= 0;
    if (smp) begin              // sample -> hold
      smp <= 0;
      hold <= 1;
    end else if (hold) begin    // hold -> first trial
      hold <= 0;
      b <= 8'b1000_0000;
      trial <= 8'b1000_0000;
      up <= 8'b1000_0000;
      dn <= 8'b0111_1111;
    end else if (trial[0]) begin  // last trial -> result, and the next sample
      data <= decided;
      eoc <= 1;
      smp <= 1;
      up <= 0;
      dn <= 0;
    end else begin
      b <= next;
      trial <= trial >> 1;
      up <= next;
      dn <= ~next;
    end
  end
endmodule
