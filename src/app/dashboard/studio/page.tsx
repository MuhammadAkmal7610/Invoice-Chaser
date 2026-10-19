import { AppNav } from "../AppNav";
import { ProductStudio } from "./ProductStudio";
export default function Studio(){return <main className="app-inner"><AppNav active="studio"/><header><a href="/dashboard">← Back to overview</a><h1>Product preview</h1><p>Explore the product capabilities and sample business metrics. No live billing or external messages are enabled here.</p></header><ProductStudio/></main>}
