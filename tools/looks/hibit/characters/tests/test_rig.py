"""The rig's directions are the animators' vocabulary: lock them down."""

import unittest

from hibit.rig import Limb, Pose, solve


class RigDirections(unittest.TestCase):
    def test_swing_forward_moves_the_hand_ahead(self) -> None:
        sk = solve(Pose(near_arm=Limb(swing=90.0), far_arm=Limb(swing=90.0)))
        for chain in (sk.near_arm, sk.far_arm):
            self.assertGreater(chain.end[0], chain.root[0] + 8)

    def test_raised_arm_points_up(self) -> None:
        sk = solve(Pose(near_arm=Limb(swing=170.0)))
        self.assertGreater(sk.near_arm.end[1], sk.near_arm.root[1] + 12)

    def test_spread_lifts_each_arm_to_its_own_side(self) -> None:
        sk = solve(Pose(near_arm=Limb(spread=80.0), far_arm=Limb(spread=80.0)))
        self.assertGreater(sk.near_arm.end[2], sk.near_arm.root[2])
        self.assertLess(sk.far_arm.end[2], sk.far_arm.root[2])

    def test_elbow_folds_forward_and_knee_folds_back(self) -> None:
        sk = solve(Pose(near_arm=Limb(bend=90.0), near_leg=Limb(bend=90.0)))
        self.assertGreater(sk.near_arm.end[0], sk.near_arm.mid[0] + 4)
        self.assertLess(sk.near_leg.end[0], sk.near_leg.mid[0] - 4)

    def test_lean_tips_the_head_forward(self) -> None:
        upright = solve(Pose(lean=0.0))
        leaning = solve(Pose(lean=20.0))
        self.assertGreater(leaning.head[0], upright.head[0] + 4)

    def test_ik_reaches_its_target(self) -> None:
        shoulder = solve(Pose()).near_arm.root
        target = (shoulder[0] + 6.0, shoulder[1] - 9.0, shoulder[2] + 2.0)  # well within reach
        sk = solve(Pose(near_arm=Limb(target=target)))
        for got, want in zip(sk.near_arm.end, target):
            self.assertAlmostEqual(got, want, delta=0.05)


if __name__ == "__main__":
    unittest.main()
