import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import customersRouter from "./customers";
import leadsRouter from "./leads";
import productsRouter from "./products";
import ordersRouter from "./orders";
import deliveriesRouter from "./deliveries";
import accountingRouter from "./accounting";
import activityRouter from "./activity";
import dashboardRouter from "./dashboard";
import invoicingRouter from "./invoicing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(customersRouter);
router.use(leadsRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(deliveriesRouter);
router.use(accountingRouter);
router.use(activityRouter);
router.use(dashboardRouter);
router.use(invoicingRouter);

export default router;
